const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { _electron } = require('playwright');
const { WebSocketServer } = require('ws');
const esbuild = require('esbuild');
const less = require('@umijs/deps/compiled/less');

const root = path.resolve(__dirname, '..');

// 两个真实 BrowserWindow、preload、IPC 和 xterm；仅替换 SSH 后端与系统光标坐标。
test(
    'Electron: drag between windows, native preview, rollback and session history',
    { timeout: 90000 },
    async (t) => {
        const output = await fs.mkdtemp(path.join(os.tmpdir(), 'elecshell-window-drag-'));
        let app, server, sockets;
        const events = [];
        const errors = [];
        try {
            await esbuild.build({
                entryPoints: [path.join(__dirname, 'fixtures/session-workspace.tsx')],
                bundle: true,
                outdir: output,
                platform: 'browser',
                logLevel: 'error',
                define: { 'process.env.NODE_ENV': '"test"' },
                plugins: [
                    {
                        name: 'test-backend',
                        setup(build) {
                            build.onResolve({ filter: /platform\/backend$/ }, () => ({
                                path: 'backend',
                                namespace: 'test',
                            }));
                            build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
                                loader: 'js',
                                contents: `export const getBackendUrl=async()=>location.origin+'/';export const backendRequest=async(uri,options)=>fetch('/'+uri,options).then(r=>r.json());`,
                            }));
                            build.onLoad({ filter: /\.less$/ }, async (args) => ({
                                loader: 'css',
                                contents: (
                                    await less.render(await fs.readFile(args.path, 'utf8'), {
                                        filename: args.path,
                                    })
                                ).css,
                            }));
                        },
                    },
                ],
            });
            server = http.createServer(async (req, res) => {
                if (req.url.startsWith('/session-workspace.')) {
                    const filename = req.url.slice(1);
                    res.setHeader(
                        'content-type',
                        filename.endsWith('.css') ? 'text/css' : 'application/javascript',
                    );
                    res.end(await fs.readFile(path.join(output, filename)));
                } else {
                    res.setHeader('content-type', 'text/html');
                    res.end(
                        '<html><head><link rel="stylesheet" href="/session-workspace.css"></head><body style="margin:0"><div id="root"></div><script src="/session-workspace.js"></script></body></html>',
                    );
                }
            });
            sockets = new WebSocketServer({ server });
            sockets.on('connection', (socket, request) => {
                const id = new URL(request.url, 'http://localhost').searchParams.get('id');
                events.push(['open', id]);
                socket.send(
                    JSON.stringify({
                        type: 'data',
                        val: Buffer.from(`history-${id}\r\n`).toString('base64'),
                    }),
                );
                socket.on('message', (raw) => {
                    const message = JSON.parse(String(raw));
                    if (message.type === 'detach') events.push(['detach', id]);
                });
                socket.on('close', () => events.push(['close', id]));
            });
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
            const url = `http://127.0.0.1:${server.address().port}`;
            const harness = path.join(output, 'main.cjs');
            await fs.mkdir(path.join(output, 'profile'));
            await fs.writeFile(
                harness,
                `
                process.on('uncaughtException', error => { console.error(error); process.exit(1); });
                const {app, BrowserWindow, screen} = require('electron');
                app.setPath('userData', ${JSON.stringify(path.join(output, 'profile'))});
                const {cleanupDragOverlay} = require(${JSON.stringify(
                    path.join(root, 'src/app/lib/window.js'),
                )});
                app.on('before-quit', cleanupDragOverlay);
                global.dragCursor = {x: -5000, y: -5000};
                app.whenReady().then(async () => {
                    screen.getCursorScreenPoint = () => global.dragCursor;
                    global.windows = {};
                    for (const [name, x, sessions] of [['source', 30, 'A,B'], ['target', 700, 'Z']]) {
                        const win = new BrowserWindow({x, y: 100, width: 650, height: 800, frame: false,
                            webPreferences: {preload: ${JSON.stringify(
                                path.join(root, 'src/app/lib/preload.js'),
                            )},
                                nodeIntegration: true, contextIsolation: false}});
                        global.windows[name] = win;
                        await win.loadURL(${JSON.stringify(url)} + '/?sessions=' + sessions +
                            (name === 'source' ? '&initialContent=initial-A' : ''));
                    }
                });
            `,
            );
            app = await _electron.launch({
                args: [harness],
                timeout: 15000,
                env: { ...process.env, NODE_ENV: 'test' },
            });
            const source = await app.firstWindow();
            await source.waitForFunction(() => !!window.workspace?.runtimes.B?.term.element);
            const target =
                app.windows().find((page) => page !== source) ||
                (await app.waitForEvent('window', {
                    predicate: (page) => page !== source,
                    timeout: 10000,
                }));
            assert.ok(target, 'target window was created');
            await target.waitForFunction(() => !!window.workspace?.runtimes.Z?.term.element);
            for (const page of [source, target]) {
                page.setDefaultTimeout(8000);
                page.on('pageerror', (error) => errors.push(error.message));
            }
            await target.evaluate(() => (window.originalZ = window.workspace.runtimes.Z));
            await app.evaluate(() => global.windows.target.webContents.setZoomFactor(1.05));
            await source.evaluate(
                () =>
                    new Promise((resolve) =>
                        window.workspace.runtimes.A.term.write('\r\nroundtrip-marker\r\n', resolve),
                    ),
            );
            const cursor = async (name, point) =>
                app.evaluate(
                    (_electron, { name, point }) => {
                        const win = global.windows[name];
                        const bounds = win.getContentBounds();
                        const zoom = win.webContents.getZoomFactor();
                        global.dragCursor = {
                            x: Math.round(bounds.x + point.x * zoom),
                            y: Math.round(bounds.y + point.y * zoom),
                        };
                    },
                    { name, point },
                );
            const move = async (from, fromName, key, toName, point) => {
                const tab = await from.locator(`[data-session-tab="${key}"]`).boundingBox();
                await cursor(fromName, { x: tab.x + 20, y: tab.y + 16 });
                await from.mouse.move(tab.x + 20, tab.y + 16);
                await from.mouse.down();
                await from.mouse.move(tab.x + 40, tab.y + 16);
                await cursor(toName, point);
                const sourcePoint = await app.evaluate((_electron, name) => {
                    const bounds = global.windows[name].getContentBounds();
                    const zoom = global.windows[name].webContents.getZoomFactor();
                    return {
                        x: (global.dragCursor.x - bounds.x) / zoom,
                        y: (global.dragCursor.y - bounds.y) / zoom,
                    };
                }, fromName);
                await from.mouse.move(sourcePoint.x, sourcePoint.y, { steps: 6 });
            };

            // 拖出源窗口仍显示标题；目标窗口无需获得 DOM 鼠标事件即可预览。
            const pane = await target.locator('.session-workspace').boundingBox();
            const right = { x: pane.x + pane.width * 0.8, y: 250 };
            await move(source, 'source', 'A', 'target', right);
            await target.locator('.session-drop-preview').waitFor();
            assert.equal(await target.locator('.session-drop-preview span').textContent(), 'Right');
            const overlay =
                app.windows().find((page) => page !== source && page !== target) ||
                (await app.waitForEvent('window', {
                    predicate: (page) => page !== source && page !== target,
                    timeout: 10000,
                }));
            assert.ok(overlay, 'native preview window exists');
            overlay.setDefaultTimeout(8000);
            await overlay.locator('#label').waitFor();
            assert.equal(await overlay.locator('#label').textContent(), 'A');
            assert.equal(
                await overlay
                    .locator('#card')
                    .evaluate((element) => getComputedStyle(element).backgroundColor),
                'rgb(255, 255, 255)',
            );
            await t.test('native preview keeps its cursor offset across display edges', async () => {
                // 在真实屏幕内模拟四块不同缩放的屏幕，避免依赖测试机器的显示器排列。
                const seam = await app.evaluate(({ screen }) => {
                    const area = screen.getPrimaryDisplay().workArea;
                    const x = Math.round(area.x + area.width / 2);
                    const y = Math.round(area.y + area.height / 2);
                    global.savedDragCursor = global.dragCursor;
                    global.savedDisplayNearestPoint = screen.getDisplayNearestPoint;
                    screen.getDisplayNearestPoint = (point) => ({
                        scaleFactor: point.x < x ? 1 : 2,
                        workArea: {
                            x: point.x < x ? area.x : x,
                            y: point.y < y ? area.y : y,
                            width: Math.floor(area.width / 2),
                            height: Math.floor(area.height / 2),
                        },
                    });
                    return { x, y };
                });
                const assertPosition = async (point) => {
                    const expected = [point.x - 40, point.y - 14];
                    const actual = await app.evaluate(async ({ BrowserWindow }, position) => {
                        const win = BrowserWindow.getAllWindows().find(
                            (item) => item.getTitle() === 'drag-overlay',
                        );
                        for (let attempt = 0; attempt < 60; attempt++) {
                            const current = win.getPosition();
                            if (current[0] === position[0] && current[1] === position[1])
                                return current;
                            await new Promise((resolve) => setTimeout(resolve, 16));
                        }
                        return win.getPosition();
                    }, expected);
                    assert.deepEqual(actual, expected, `cursor at ${JSON.stringify(point)}`);
                };
                try {
                    // 首次显示和定时跟随都必须允许浮层跨越屏幕边缘。
                    for (const initial of [
                        { x: seam.x - 1, y: seam.y - 1 },
                        { x: seam.x + 1, y: seam.y + 1 },
                    ]) {
                        await app.evaluate((_electron, point) => (global.dragCursor = point), initial);
                        await source.evaluate(() => window.electronAPI.showDragOverlay({ label: 'A' }));
                        await assertPosition(initial);
                        for (const delta of [
                            { x: 1, y: -1 },
                            { x: 1, y: 1 },
                            { x: -1, y: 1 },
                            { x: -1, y: -1 },
                        ]) {
                            const point = { x: seam.x + delta.x, y: seam.y + delta.y };
                            await app.evaluate((_electron, next) => (global.dragCursor = next), point);
                            await assertPosition(point);
                        }
                    }
                } finally {
                    await app.evaluate(({ screen }) => {
                        screen.getDisplayNearestPoint = global.savedDisplayNearestPoint;
                        global.dragCursor = global.savedDragCursor;
                    });
                }
            });
            await source.mouse.up();
            await target.waitForFunction(() => !!window.workspace.runtimes.A?.term.element);
            await source.locator('[data-session-tab="A"]').waitFor({ state: 'detached' });
            assert.equal(await target.locator('[data-group-id]').count(), 2);
            assert.equal(
                await target.evaluate(() => window.workspace.runtimes.Z === window.originalZ),
                true,
            );
            assert.match(
                await target.evaluate(() =>
                    window.workspace.runtimes.A.term.buffer.active.getLine(0).translateToString(),
                ),
                /history-A/,
            );
            const handoff = events.filter((event) => event[1] === 'A').map((event) => event[0]);
            assert.deepEqual(handoff, ['open', 'detach', 'close', 'open']);

            // 回拖到源窗口标签栏，保留原窗口 B 的终端。
            await source.evaluate(() => (window.originalB = window.workspace.runtimes.B));
            await move(target, 'target', 'A', 'source', { x: 170, y: 18 });
            await source.locator('.session-drop-preview').waitFor();
            await target.mouse.up();
            await source.waitForFunction(() => !!window.workspace.runtimes.A?.term.element);
            assert.equal(
                await source.evaluate(() => window.workspace.runtimes.B === window.originalB),
                true,
            );
            assert.equal(await target.locator('[data-group-id]').count(), 1);
            assert.match(
                await source.evaluate(() => {
                    const buffer = window.workspace.runtimes.A.term.buffer.active;
                    return Array.from({ length: buffer.length }, (_, index) =>
                        buffer.getLine(index).translateToString(),
                    ).join('\n');
                }),
                /roundtrip-marker/,
            );

            // 目标侧边栏拒收时，原标签与 socket 都保留。
            await move(source, 'source', 'B', 'target', { x: 40, y: 250 });
            await source.mouse.up();
            await source.waitForFunction(
                () => !document.querySelector('.session-workspace--dragging'),
            );
            assert.equal(
                await source.evaluate(() => window.workspace.runtimes.B === window.originalB),
                true,
            );
            assert.equal(
                events.filter((event) => event[0] === 'detach' && event[1] === 'B').length,
                0,
            );

            // 预留落点后目标页面消失：提交失败会在源窗口恢复标签和历史。
            await move(source, 'source', 'B', 'target', { x: pane.x + pane.width / 2, y: 250 });
            await target.locator('.session-drop-preview').waitFor();
            await source.evaluate(() => {
                const ipc = window.electronAPI.ipcRenderer;
                const invoke = ipc.invoke.bind(ipc);
                ipc.invoke = async (channel, ...args) => {
                    if (channel === 'session-drag-commit') {
                        await invoke('test-close-target');
                    }
                    return invoke(channel, ...args);
                };
            });
            await app.evaluate(({ ipcMain }) =>
                ipcMain.handle('test-close-target', () => {
                    global.windows.target.destroy();
                }),
            );
            await source.mouse.up();
            await source.waitForFunction(
                () =>
                    !!window.workspace.runtimes.B?.term.element &&
                    window.workspace.runtimes.B !== window.originalB,
            );
            assert.match(
                await source.evaluate(() =>
                    window.workspace.runtimes.B.term.buffer.active.getLine(0).translateToString(),
                ),
                /history-B/,
            );
            assert.deepEqual(errors, []);
        } finally {
            if (app) await app.close();
            if (sockets) {
                sockets.clients.forEach((socket) => socket.terminate());
                await new Promise((resolve) => sockets.close(resolve));
            }
            if (server) await new Promise((resolve) => server.close(resolve));
            await fs.rm(output, { recursive: true, force: true });
        }
    },
);
