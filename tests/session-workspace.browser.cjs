const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const {chromium} = require('playwright');
const esbuild = require('esbuild');
const less = require('@umijs/deps/compiled/less');
const {WebSocketServer} = require('ws');

const root = path.resolve(__dirname, '..');

// 使用真实 Workspace、xterm 和鼠标事件；仅模拟后端/宿主接口，验证拖拽不会重连或丢内容。
test('browser: split, move, resize and merge live terminals without reconnecting', {timeout: 120000}, async t => {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), 'elecshell-workspace-'));
    let server, browser, websocketServer;
    const clients = new Map();
    const connections = [];
    const closes = [];
    const resizeMessages = [];
    const messages = [];
    const errors = [];
    try {
        await esbuild.build({
            entryPoints: [path.join(__dirname, 'fixtures/session-workspace.tsx')], bundle: true,
            outdir: output, platform: 'browser', define: {'process.env.NODE_ENV': '"test"'}, logLevel: 'warning',
            plugins: [{name: 'fixture-dependencies', setup(build) {
                // 替换配置、全局上下文和请求地址，保持被测的分屏及终端实现不变。
                build.onResolve({filter: /^@\/pages\/context\/AppContextProvider$/}, () => ({path: path.join(__dirname, 'fixtures/workspaceContext.tsx')}));
                build.onResolve({filter: /^(?:@\/util|\.\.\/\.\.\/\.\.\/\.\.\/util)$/}, () => ({path: 'util', namespace: 'fixture'}));
                build.onLoad({filter: /.*/, namespace: 'fixture'}, () => ({loader: 'js', contents:
                    `export const callbackMap={};export const sessionStatusMap={};export const getUUid=()=>crypto.randomUUID();export const showMessage=()=>{};export default {getUrl:async()=>location.origin+'/',request:async(uri,options)=>fetch('/'+uri,options).then(r=>r.json())};`}));
                build.onLoad({filter: /\.less$/}, async args => ({loader: 'css', contents: (await less.render(await fs.readFile(args.path, 'utf8'), {filename: args.path})).css}));
            }}],
        });
        server = http.createServer(async (req, res) => {
            if (req.url === '/session') {
                let body = '';
                for await (const data of req) body += data;
                const request = JSON.parse(body);
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({id: request.id || 'script-new', filePath: '/configs/script', sessionName: 'Script'}));
                return;
            }
            const filename = req.url === '/session-workspace.js' ? 'session-workspace.js' : req.url === '/session-workspace.css' ? 'session-workspace.css' : null;
            if (filename) {
                res.setHeader('content-type', filename.endsWith('.css') ? 'text/css' : 'application/javascript');
                res.end(await fs.readFile(path.join(output, filename)));
            } else {
                res.setHeader('content-type', 'text/html');
                res.end('<html><head><link rel="stylesheet" href="/session-workspace.css"></head><body style="margin:0"><div id="root"></div><script src="/session-workspace.js"></script></body></html>');
            }
        });
        websocketServer = new WebSocketServer({server});
        websocketServer.on('connection', (socket, request) => {
            const id = new URL(request.url, 'http://localhost').searchParams.get('id');
            clients.set(id, socket);
            connections.push(id);
            let tick = 0;
            // 连续编号可同时检测缓冲区丢行、重复回放和连接重建。
            const timer = setInterval(() => {
                if (socket.readyState === 1) socket.send(JSON.stringify({type: 'data', val: Buffer.from(`${id}:${++tick}\r\n`).toString('base64')}));
            }, 40);
            socket.on('message', raw => {
                const message = JSON.parse(String(raw));
                messages.push({id, ...message});
                if (message.type === 'resize') resizeMessages.push({id, size: message.resize});
            });
            socket.on('close', () => { clearInterval(timer); closes.push(id); clients.delete(id); });
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const executablePath = process.env.CHROME_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined);
        browser = await chromium.launch({headless: true, ...(executablePath ? {executablePath} : {})});
        const page = await browser.newPage({viewport: {width: 1500, height: 800}});
        page.setDefaultTimeout(8000);
        page.on('pageerror', error => errors.push(error.message));
        const layoutStorageKey = 'elecshell.terminal-layout.v1';
        const legacyLayout = JSON.stringify({version: 1, root: {
            type: 'split', axis: 'x', ratio: 0.5, children: [
                {type: 'group', sessions: ['/configs/A']},
                {type: 'group', sessions: ['/configs/B', '/configs/C', '/configs/D', '/configs/E', '/configs/F']},
            ],
        }});
        await page.addInitScript(({key, cached}) => {
            const getItem = Storage.prototype.getItem;
            const setItem = Storage.prototype.setItem;
            // 只在首次加载注入旧缓存；刷新时保留原值，以检测关闭页面时是否仍在保存布局。
            if (getItem.call(localStorage, key) === null) setItem.call(localStorage, key, cached);
            window.layoutStorageCalls = [];
            window.readLegacyLayout = () => getItem.call(localStorage, key);
            Storage.prototype.getItem = function (name) {
                if (name === key) window.layoutStorageCalls.push('read');
                return getItem.call(this, name);
            };
            Storage.prototype.setItem = function (name, value) {
                if (name === key) window.layoutStorageCalls.push('write');
                return setItem.call(this, name, value);
            };
        }, {key: layoutStorageKey, cached: legacyLayout});
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => Object.keys(window.workspace.runtimes).length === 6 && Object.values(window.workspace.runtimes).every(runtime => !!runtime.term.element));
        await page.evaluate(() => { window.originalRuntimes = {...window.workspace.runtimes}; });
        const groupFor = async key => page.evaluate(key => {
            const groups = node => node.type === 'group' ? [node] : node.children.flatMap(groups);
            return groups(window.workspace.state.root).find(group => group.tabs.includes(key)).id;
        }, key);
        const bounds = async key => page.locator(`[data-group-id="${await groupFor(key)}"]`).boundingBox();
        const drag = async (key, targetKey, position) => {
            const tab = await page.locator(`[data-session-tab="${key}"]`).boundingBox();
            const pane = await bounds(targetKey);
            const content = {y: pane.y + 40, height: pane.height - 40};
            // 在距边缘四分之一处松手，确保真实分屏也支持提前触发，而非只在最边缘生效。
            const points = {
                left: {x: pane.x + pane.width * 0.25, y: content.y + content.height / 2},
                right: {x: pane.x + pane.width * 0.75, y: content.y + content.height / 2},
                top: {x: pane.x + pane.width / 2, y: content.y + content.height * 0.25},
                bottom: {x: pane.x + pane.width / 2, y: content.y + content.height * 0.75},
                center: {x: pane.x + pane.width / 2, y: content.y + content.height / 2},
            };
            const point = points[position];
            await page.mouse.move(tab.x + 24, tab.y + tab.height / 2);
            await page.mouse.down();
            await page.mouse.move(point.x, point.y, {steps: 12});
            await page.locator('.session-drop-preview').waitFor();
            const label = {left: 'Left', right: 'Right', top: 'Above', bottom: 'Below', center: 'Merge'}[position];
            assert.equal(await page.locator('.session-drop-preview span').textContent(), label);
            await page.mouse.up();
            await page.locator('.session-drop-preview').waitFor({state: 'detached'});
        };
        const assertRuntimes = async () => {
            // 除了布局结果，还核对实例身份、连接次数与连续输出，避免“看似移动、实际重建”。
            assert.equal(await page.evaluate(() => ['A','B','C','D','E','F'].every(id => window.workspace.runtimes[id] === window.originalRuntimes[id]
                && window.workspace.runtimes[id].term.element.isConnected && window.workspace.runtimes[id].sock.readyState === 1)), true);
            assert.deepEqual(connections.slice().sort(), ['A','B','C','D','E','F']);
            assert.deepEqual(closes, []);
            assert.deepEqual(errors, []);
            assert.equal(await page.evaluate(() => ['A','B','C','D','E','F'].every(id => {
                const buffer = window.workspace.runtimes[id].term.buffer.active;
                const values = Array.from({length: buffer.length}, (_, index) => buffer.getLine(index).translateToString(true))
                    .filter(line => line.startsWith(id + ':')).map(line => Number(line.split(':')[1]));
                return values.length > 2 && values.every((value, index) => !index || value === values[index - 1] + 1);
            })), true);
        };

        await t.test('new connections use one full-width pane despite an old cached split layout', async () => {
            assert.equal(await page.locator('[data-group-id]').count(), 1);
            assert.equal(await page.locator('.session-splitter').count(), 0);
            const workspace = await page.locator('.session-workspace').boundingBox();
            const terminal = await page.locator('[data-terminal-session="A"]').boundingBox();
            assert.equal(terminal.width, workspace.width);
            assert.equal(await groupFor('A'), await groupFor('B'));
            assert.deepEqual(await page.evaluate(() => window.layoutStorageCalls), []);
        });
        await t.test('drag preview keeps the original pointer grab position on activation and movement', async () => {
            const tab = await page.locator('[data-session-tab="A"]').boundingBox();
            const grab = {x: tab.x + 20, y: tab.y + 20};
            await page.mouse.move(grab.x, grab.y);
            await page.mouse.down();
            try {
                for (const delta of [{x: 16, y: 12}, {x: 100, y: 90}]) {
                    await page.mouse.move(grab.x + delta.x, grab.y + delta.y, {steps: 3});
                    const label = page.locator('.session-workspace-drag-label');
                    await label.waitFor();
                    const preview = await label.boundingBox();
                    assert.ok(Math.abs(preview.x - tab.x - delta.x) < 1, 'The preview must preserve its horizontal grab offset');
                    assert.ok(Math.abs(preview.y - tab.y - delta.y) < 1, 'The preview must preserve its vertical grab offset');
                }
            } finally {
                await page.mouse.move(grab.x, grab.y, {steps: 3});
                await page.mouse.up();
            }
        });
        await t.test('one drag switches between all four split previews and center without reaching an edge', async () => {
            const tab = await page.locator('[data-session-tab="B"]').boundingBox();
            const pane = await bounds('A');
            const contentHeight = pane.height - 40;
            await page.mouse.move(tab.x + 20, tab.y + 20);
            await page.mouse.down();
            try {
                for (const [x, y, label] of [
                    [0.32, 0.5, 'Left'], [0.68, 0.5, 'Right'],
                    [0.5, 0.32, 'Above'], [0.5, 0.68, 'Below'],
                    [0.5, 0.5, 'Merge'],
                ]) {
                    await page.mouse.move(pane.x + pane.width * x, pane.y + 40 + contentHeight * y, {steps: 6});
                    await page.waitForFunction(expected => document.querySelector('.session-drop-preview span')?.textContent === expected, label);
                    const preview = await page.locator('.session-drop-preview').boundingBox();
                    if (label === 'Left' || label === 'Right') {
                        assert.ok(Math.abs(preview.width - (pane.width - 5) / 2) < 1);
                        assert.ok(Math.abs(preview.x - (label === 'Left' ? pane.x : pane.x + (pane.width + 5) / 2)) < 1);
                    } else if (label === 'Above' || label === 'Below') {
                        assert.ok(Math.abs(preview.height - (pane.height - 5) / 2) < 1);
                        assert.ok(Math.abs(preview.y - (label === 'Above' ? pane.y : pane.y + (pane.height + 5) / 2)) < 1);
                    }
                }
            } finally {
                await page.mouse.move(tab.x + 20, tab.y + 20, {steps: 3});
                await page.mouse.up();
            }
            assert.equal(await page.locator('[data-group-id]').count(), 1);
        });
        await t.test('four-direction nested splits preview and commit well before reaching the pane edges', async () => {
            await drag('B', 'A', 'right');
            await drag('C', 'B', 'bottom');
            await drag('D', 'A', 'left');
            await drag('E', 'C', 'top');
            assert.equal(await page.locator('[data-group-id]').count(), 5);
            const handle = page.locator('.session-splitter--x').first();
            const box = await handle.boundingBox();
            const before = await bounds('D');
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.mouse.move(box.x + 70, box.y + box.height / 2, {steps: 8});
            await page.mouse.up();
            assert.notEqual((await bounds('D')).width, before.width);
            assert.ok(resizeMessages.some(message => message.id === 'B'));
            await assertRuntimes();
        });
        await t.test('Escape does not cancel an active drag', async () => {
            const tab = await page.locator('[data-session-tab="F"]').boundingBox();
            const pane = await bounds('B');
            await page.mouse.move(tab.x + 20, tab.y + 16);
            await page.mouse.down();
            await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2, {steps: 10});
            await page.keyboard.press('Escape');
            assert.equal(await page.locator('.session-drop-preview').count(), 1);
            await page.mouse.up();
            assert.equal(await groupFor('F'), await groupFor('B'));
            await assertRuntimes();
        });
        await t.test('focus, terminal input, pane maximize/restore and search adapt to pane size', async () => {
            await page.locator('[data-session-tab="C"] .ant-tabs-tab-btn').click();
            const groupId = await groupFor('C');
            await page.locator(`[data-group-id="${groupId}"] [aria-label="Maximize"]`).click();
            assert.equal(await page.locator('[data-group-id]').count(), 1);
            await page.locator(`[data-group-id="${groupId}"] [aria-label="Restore"]`).click();
            assert.equal(await page.locator('[data-group-id]').count(), 5);
            await page.locator('[data-terminal-session="C"] .xterm-screen').click();
            await page.keyboard.type('echo test');
            await page.keyboard.press('Enter');
            assert.ok(messages.filter(message => message.id === 'C' && message.type === 'data').map(message => message.data).join('').includes('echo test'));
            await page.keyboard.press('Control+Shift+f');
            await page.locator('[data-terminal-session="C"] .session-search-panel').waitFor({state: 'visible'});
            const searchBox = await page.locator('[data-terminal-session="C"] .session-search-panel').boundingBox();
            const paneBox = await bounds('C');
            assert.ok(searchBox.width <= paneBox.width + 1);

            // 用实际查找结果验证选项组合与前后跳转，避免只检查按钮外观。
            clients.get('C').send(JSON.stringify({type: 'data', val: Buffer.from('Alpha alphabet ALPHA token42 token43\r\n').toString('base64')}));
            await page.waitForFunction(() => {
                const buffer = window.workspace.runtimes.C.term.buffer.active;
                return Array.from({length: buffer.length}, (_, index) => buffer.getLine(index).translateToString(true)).some(line => line.includes('token43'));
            });
            const search = page.locator('[data-terminal-session="C"] .session-search-panel');
            const query = search.locator('textarea');
            await query.fill('aLpHa');
            await page.waitForFunction(() => !!window.workspace.runtimes.C.term.getSelection());
            await search.getByRole('button', {name: 'Cc', exact: true}).click();
            await page.waitForFunction(() => window.workspace.runtimes.C.term.getSelection() === '');
            await search.getByRole('button', {name: 'Cc', exact: true}).click();
            await page.waitForFunction(() => !!window.workspace.runtimes.C.term.getSelection());
            await query.fill('alph');
            await search.getByRole('button', {name: 'W', exact: true}).click();
            await page.waitForFunction(() => window.workspace.runtimes.C.term.getSelection() === '');
            await search.getByRole('button', {name: 'W', exact: true}).click();
            await page.waitForFunction(() => !!window.workspace.runtimes.C.term.getSelection());
            await query.fill('token4[23]');
            await page.waitForFunction(() => window.workspace.runtimes.C.term.getSelection() === '');
            await search.getByRole('button', {name: 'Exp', exact: true}).click();
            await page.waitForFunction(() => /^token4[23]$/.test(window.workspace.runtimes.C.term.getSelection()));
            const selectedMatch = await page.evaluate(() => window.workspace.runtimes.C.term.getSelection());
            await search.locator('button').nth(4).click();
            await page.waitForFunction(previous => window.workspace.runtimes.C.term.getSelection() !== previous, selectedMatch);
            await search.locator('button').nth(3).click();
            await page.waitForFunction(previous => window.workspace.runtimes.C.term.getSelection() === previous, selectedMatch);

            await page.locator('[data-terminal-session="C"] [aria-label="Close search"]').click();
            await page.locator('[data-terminal-session="E"] .xterm-screen').click();
            await page.waitForFunction(() => {
                const focused = document.activeElement.closest('[data-terminal-session]');
                return !!focused && focused.dataset.terminalSession === 'E';
            });
            await assertRuntimes();
        });
        await t.test('undersized panes block a new split without detaching or reconnecting', async () => {
            const tab = await page.locator('[data-session-tab="F"]').boundingBox();
            const pane = await bounds('C');
            await page.mouse.move(tab.x + 20, tab.y + 16);
            await page.mouse.down();
            await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height - 5, {steps: 10});
            await page.locator('.session-drop-preview--blocked').waitFor();
            await page.mouse.up();
            assert.equal(await page.locator('[data-group-id]').count(), 5);
            assert.equal(await groupFor('F'), await groupFor('B'));
            await assertRuntimes();
        });
        await t.test('leaving and reentering the window hides the native overlay and preserves the drop', async () => {
            const tab = await page.locator('[data-session-tab="F"]').boundingBox();
            const pane = await bounds('B');
            await page.mouse.move(tab.x + 20, tab.y + 16);
            await page.mouse.down();
            await page.mouse.move(-30, 250, {steps: 10});
            await page.waitForFunction(() => window.nativeCalls.some(call => call[0] === 'show'));
            await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2, {steps: 10});
            await page.mouse.up();
            await page.waitForFunction(() => window.nativeCalls[window.nativeCalls.length - 1][0] === 'hide');
            assert.deepEqual(await page.evaluate(() => window.detaches), []);
            await assertRuntimes();
        });
        await t.test('merging the final source tab collapses its pane and preserves terminal content', async () => {
            await drag('E', 'C', 'center');
            assert.equal(await page.locator('[data-group-id]').count(), 4);
            assert.equal(await groupFor('E'), await groupFor('C'));
            await assertRuntimes();
        });
        await t.test('script-created sessions and callbacks survive moving their originating tab', async () => {
            const original = await page.evaluate(() => window.workspace.runtimes.A === window.originalRuntimes.A);
            assert.equal(original, true);
            clients.get('A').send(JSON.stringify({type: 'execMethod', method: 'createNewSession', args: ['A'], requestId: 'script-request'}));
            await page.waitForFunction(() => !!window.workspace.runtimes['script-new']?.term.element);
            const scriptGroup = await groupFor('script-new');
            assert.equal(scriptGroup, await groupFor('E'));
            await drag('A', 'B', 'center');
            assert.equal(await page.evaluate(() => window.workspace.runtimes.A === window.originalRuntimes.A), true);
            await page.waitForFunction(() => window.workspace.runtimes.A.sock.readyState === 1);
            await new Promise((resolve, reject) => {
                const deadline = Date.now() + 4000;
                const check = () => {
                    if (messages.some(message => message.id === 'A' && message.type === 'callback' && message.requestId === 'script-request')) return resolve();
                    if (Date.now() > deadline) return reject(new Error('Script callback was lost'));
                    setTimeout(check, 20);
                };
                check();
            });
            await page.locator('[data-session-tab="script-new"] .ant-tabs-tab-remove').click();
            await page.locator('[data-terminal-session="script-new"]').waitFor({state: 'detached'});
            assert.deepEqual(errors, []);
        });
        await t.test('releasing outside the window still detaches the tab', async () => {
            await page.locator('#add-session').click();
            await page.waitForFunction(() => !!window.workspace.runtimes['added-6']?.term.element);
            const tab = await page.locator('[data-session-tab="added-6"]').boundingBox();
            await page.mouse.move(tab.x + 20, tab.y + 16);
            await page.mouse.down();
            await page.mouse.move(-30, 250, {steps: 10});
            await page.mouse.up();
            await page.waitForFunction(() => window.detaches.includes('added-6'));
            await page.locator('[data-terminal-session="added-6"]').waitFor({state: 'detached'});
            assert.deepEqual(errors, []);
        });
        await t.test('sidebar drop keeps detach behavior and explicit close disposes only that terminal', async () => {
            const tab = await page.locator('[data-session-tab="D"]').boundingBox();
            await page.mouse.move(tab.x + 20, tab.y + 16);
            await page.mouse.down();
            await page.mouse.move(60, 250, {steps: 10});
            await page.mouse.up();
            await page.waitForFunction(() => window.detaches.includes('D'));
            await page.locator('[data-terminal-session="D"]').waitFor({state: 'detached'});
            await page.locator('[data-session-tab="A"] .ant-tabs-tab-remove').click();
            await page.locator('[data-terminal-session="A"]').waitFor({state: 'detached'});
            await page.waitForFunction(() => !window.workspace.runtimes.A && !window.workspace.runtimes.D);
            assert.equal(await page.evaluate(() => ['B','C','E','F'].every(id => window.workspace.runtimes[id] === window.originalRuntimes[id])), true);
            assert.deepEqual(errors, []);
        });
        await t.test('manual splits stay in memory and reloading starts in one pane without accessing layout storage', async () => {
            assert.equal(await page.evaluate(() => window.workspace.state.root.type), 'split');
            assert.deepEqual(await page.evaluate(() => window.layoutStorageCalls), []);
            assert.equal(await page.evaluate(() => window.readLegacyLayout()), legacyLayout);
            await page.reload();
            await page.waitForFunction(() => Object.keys(window.workspace.runtimes).length === 6 && Object.values(window.workspace.runtimes).every(runtime => !!runtime.term.element));
            assert.equal(await page.locator('[data-group-id]').count(), 1);
            assert.equal(await page.locator('.session-splitter').count(), 0);
            assert.equal(await groupFor('A'), await groupFor('B'));
            assert.equal(await groupFor('B'), await groupFor('C'));
            const workspace = await page.locator('.session-workspace').boundingBox();
            const terminal = await page.locator('[data-terminal-session="A"]').boundingBox();
            assert.equal(terminal.width, workspace.width);
            assert.deepEqual(await page.evaluate(() => window.layoutStorageCalls), []);
            assert.equal(await page.evaluate(() => window.readLegacyLayout()), legacyLayout);
            assert.deepEqual(errors, []);
        });
    } finally {
        // 失败路径同样关闭浏览器、模拟连接和临时服务，防止测试残留进程或占用端口。
        if (browser) await browser.close();
        if (websocketServer) { websocketServer.clients.forEach(socket => socket.terminate()); await new Promise(resolve => websocketServer.close(resolve)); }
        if (server) await new Promise(resolve => server.close(resolve));
        await fs.rm(output, {recursive: true, force: true});
    }
});
