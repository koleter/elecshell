const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const { WebSocketServer } = require(path.join(root, 'node_modules/ws'));
const { chromium } = require(path.join(root, 'node_modules/playwright'));
test(
    'built frontend: catalog, settings, transfers and detached-window integration',
    { timeout: 90000 },
    async () => {
        let browser, page;
        const connected = [];
        const closed = [];
        const messages = [];
        const clients = new Map();
        const errors = [];
        const catalogWrites = [];
        const configurations = new Map(
            ['A', 'B', 'C'].map((key) => [
                key,
                {
                    sessionName: `Host ${key}`,
                    hostname: '127.0.0.1',
                    port: 22,
                    username: 'test',
                    login_script: [],
                },
            ]),
        );
        const server = http.createServer(async (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.setHeader('Access-Control-Allow-Methods', '*');
            if (req.method === 'OPTIONS') {
                res.end();
                return;
            }
            const url = new URL(req.url, 'http://localhost');
            if (url.pathname === '/conf') {
                let response = {
                    status: 'success',
                    msg: 'saved',
                    data: {
                        namespace: 'test',
                        language: 'en-US',
                        xshListWindowWidth: 250,
                        strVariableSetting: [],
                    },
                };
                if (req.method === 'POST') {
                    let raw = '';
                    for await (const bytes of req) raw += bytes;
                    const request = JSON.parse(raw);
                    if (request.type === 'SessionConfig') {
                        const operation = request.args;
                        catalogWrites.push(operation);
                        const key = (operation.path || operation.src || '').split('/').pop();
                        if (operation.type === 'readFile')
                            response.content = JSON.stringify(configurations.get(key));
                        if (operation.type === 'editSession')
                            configurations.set(key, operation.sessionInfo);
                        if (operation.type === 'addFile')
                            configurations.set('D', JSON.parse(operation.content));
                    }
                } else {
                    const type = url.searchParams.get('type');
                    if (type === 'SessionConfig')
                        response = {
                            ...response,
                            sessionConfInfo: Object.fromEntries(
                                [...configurations.keys()].map((key) => [key, `/mock/${key}`]),
                            ),
                            defaultTreeData: [
                                {
                                    key: 'root',
                                    title: 'Sessions',
                                    path: '/mock',
                                    children: [...configurations].map(([key, config]) => ({
                                        key,
                                        title: config.sessionName,
                                        path: `/mock/${key}`,
                                        isLeaf: true,
                                        encoding: 'utf-8',
                                    })),
                                },
                            ],
                        };
                    if (type === 'ScriptConfig') response = { ...response, scriptData: [] };
                }
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify(response));
                return;
            }
            if (url.pathname === '/namespace') {
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify(['test', 'other']));
                return;
            }
            if (url.pathname === '/session' && req.method === 'POST') {
                let body = '';
                for await (const bytes of req) body += bytes;
                res.setHeader('content-type', 'application/json');
                res.end(JSON.stringify({ id: JSON.parse(body).id }));
                return;
            }
            const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
            try {
                res.setHeader(
                    'content-type',
                    relative.endsWith('.css')
                        ? 'text/css'
                        : relative.endsWith('.js')
                        ? 'application/javascript'
                        : 'text/html',
                );
                res.end(await fs.readFile(path.join(root, 'antdBuild', relative)));
            } catch {
                res.statusCode = 404;
                res.end();
            }
        });
        const wss = new WebSocketServer({ server });
        wss.on('connection', (socket, req) => {
            const id = new URL(req.url, 'http://localhost').searchParams.get('id');
            connected.push(id);
            clients.set(id, socket);
            socket.on('message', (raw) => {
                const message = JSON.parse(String(raw));
                messages.push({ id, ...message });
                if (
                    message.type === 'exec_worker_method' &&
                    message.methodName === 'get_remote_file_list'
                ) {
                    socket.send(
                        JSON.stringify({
                            type: 'execSessionMethod',
                            method: 'refreshRemoteFileList',
                            args: [{ title: 'sample.log', key: 'sample.log', isLeaf: true }],
                        }),
                    );
                }
            });
            socket.send(
                JSON.stringify({
                    type: 'data',
                    val: Buffer.from(`connected ${id}\r\n`).toString('base64'),
                }),
            );
            socket.on('close', () => closed.push(id));
        });
        try {
            await new Promise((resolve) => server.listen(0, resolve));
            const port = server.address().port;
            const executablePath =
                process.env.CHROME_PATH ||
                (process.platform === 'darwin'
                    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
                    : undefined);
            browser = await chromium.launch({
                headless: true,
                ...(executablePath ? { executablePath } : {}),
            });
            page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
            page.setDefaultTimeout(10000);
            page.on('pageerror', (error) => errors.push(error.message));
            await page.addInitScript((port) => {
                const listeners = new Map();
                window.__ipcListeners = listeners;
                window.__fileWrites = [];
                window.__emitIpc = (channel, ...args) =>
                    listeners.get(channel)?.forEach((listener) => listener({}, ...args));
                window.electronAPI = {
                    platform: 'linux',
                    ipcRenderer: {
                        on(channel, listener) {
                            const entries = listeners.get(channel) || new Set();
                            entries.add(listener);
                            listeners.set(channel, entries);
                        },
                        removeListener(channel, listener) {
                            listeners.get(channel)?.delete(listener);
                        },
                        send() {},
                        invoke: async (channel) => (channel === 'request-server-port' ? port : {}),
                    },
                    FS_writeFileSync: (...args) => window.__fileWrites.push(['write', ...args]),
                    FS_appendFileSync: (...args) => window.__fileWrites.push(['append', ...args]),
                    FS_readFileSync: () => 'restored terminal content\r\n',
                    FS_unlinkSync() {},
                    showDragOverlay: async () => {},
                    hideDragOverlay: async () => {},
                };
            }, port);
            await page.goto(`http://localhost:${port}/#/session`);
            await page.locator('.ant-tree-switcher_close').click();
            await page.getByText('Host A', { exact: true }).dblclick();
            await page.waitForFunction(() => document.querySelectorAll('.xterm').length === 1);
            await page.getByText('Host B', { exact: true }).dblclick();
            await page.waitForFunction(() => document.querySelectorAll('.xterm').length === 2);
            const ids = await page
                .locator('[data-session-tab]')
                .evaluateAll((elements) => elements.map((element) => element.dataset.sessionTab));
            const source = await page.locator(`[data-session-tab="${ids[1]}"]`).boundingBox();
            const pane = await page.locator('[data-group-id]').boundingBox();
            await page.mouse.move(source.x + 24, source.y + 20);
            await page.mouse.down();
            await page.mouse.move(pane.x + pane.width - 10, pane.y + pane.height / 2, {
                steps: 12,
            });
            await page.locator('.session-drop-preview').waitFor();
            await page.mouse.up();
            assert.equal(await page.locator('[data-group-id]').count(), 2);
            await page.getByText('Host C', { exact: true }).dblclick();
            await page.waitForFunction(() => document.querySelectorAll('.xterm').length === 3);
            const panes = await page
                .locator('[data-group-id]')
                .evaluateAll((elements) =>
                    elements.map((element) =>
                        [...element.querySelectorAll('[data-session-tab]')].map(
                            (tab) => tab.textContent,
                        ),
                    ),
                );
            assert.equal(panes[1].length, 2);
            await page.locator('.ant-menu-item').nth(1).click();
            const transfer = page.locator('.FileTransfer:visible');
            await transfer.locator('.ant-input-search input').fill('/tmp');
            await transfer.locator('.ant-input-search input').press('Enter');
            await transfer.getByText('sample.log', { exact: true }).waitFor();
            const download = await transfer
                .getByText('sample.log', { exact: true })
                .evaluate((element) => {
                    const dataTransfer = new DataTransfer();
                    element.dispatchEvent(
                        new DragEvent('dragstart', { bubbles: true, dataTransfer }),
                    );
                    const payload = dataTransfer.getData('downloadURL');
                    element.dispatchEvent(
                        new DragEvent('dragend', { bubbles: true, dataTransfer }),
                    );
                    return payload;
                });
            assert.ok(download.startsWith('application/octet-stream:sample.log:'));
            const downloadUrl = new URL(download.slice(download.indexOf('http:')));
            assert.deepEqual(JSON.parse(downloadUrl.searchParams.get('files')), ['sample.log']);
            assert.equal(downloadUrl.searchParams.get('remoteDir'), '/tmp');

            assert.ok(
                messages.some(
                    (message) =>
                        message.type === 'exec_worker_method' &&
                        message.methodName === 'get_remote_file_list' &&
                        message.args[0] === '/tmp',
                ),
            );
            const activeSession = messages.findLast(
                (message) => message.type === 'exec_worker_method',
            ).id;
            await transfer.locator('.dropDiv').evaluate((element) => {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(new File(['content'], 'local.txt'));
                Object.defineProperty(File.prototype, 'path', {
                    configurable: true,
                    get: () => '/tmp/local.txt',
                });
                try {
                    element.dispatchEvent(
                        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }),
                    );
                } finally {
                    delete File.prototype.path;
                }
            });
            await new Promise((resolve, reject) => {
                const deadline = Date.now() + 3000;
                const check = () => {
                    const upload = messages.find(
                        (message) =>
                            message.id === activeSession && message.methodName === 'upload_files',
                    );
                    if (upload) {
                        assert.deepEqual(upload.args, [
                            [{ name: 'local.txt', path: '/tmp/local.txt' }],
                            '/tmp',
                        ]);
                        return resolve();
                    }
                    if (Date.now() > deadline)
                        return reject(new Error('Upload message was not sent'));
                    setTimeout(check, 20);
                };
                check();
            });
            await page.evaluate(
                (id) =>
                    window.__emitIpc(
                        'selected-file',
                        { canceled: false, filePath: '/tmp/session.log' },
                        id,
                    ),
                activeSession,
            );
            clients
                .get(activeSession)
                .send(
                    JSON.stringify({
                        type: 'data',
                        val: Buffer.from('log-smoke\r\n').toString('base64'),
                    }),
                );
            await page.waitForFunction(() =>
                window.__fileWrites.some(
                    (entry) =>
                        entry[0] === 'append' &&
                        entry[1] === '/tmp/session.log' &&
                        entry[2].includes('log-smoke'),
                ),
            );

            clients
                .get(activeSession)
                .send(
                    JSON.stringify({
                        type: 'execSessionMethod',
                        method: 'refreshFileProgressInfo',
                        args: { id: 'transfer-1', filePath: '/tmp/sample.log', percent: 50 },
                    }),
                );
            await transfer.locator('.ant-progress-text').filter({ hasText: '50%' }).waitFor();
            await page.locator('.ant-menu-item').first().click();
            const tree = page.locator('.sessionList');
            await tree.getByText('Host C', { exact: true }).click({ button: 'right' });
            await page.getByRole('menuitem', { name: /^edit$/i }).click();
            const editDialog = page.locator('.ant-modal-wrap:visible');
            await editDialog.locator('input#sessionName').fill('Edited Host C');
            await editDialog.getByRole('button', { name: /^OK$/i }).click();
            await page
                .locator('.ant-modal-wrap')
                .filter({ has: page.locator('input#sessionName') })
                .waitFor({ state: 'hidden' });
            await tree.getByText('Edited Host C', { exact: true }).waitFor();
            const edited = catalogWrites.find((operation) => operation.type === 'editSession');
            assert.equal(edited.src, '/mock/C');
            assert.equal(edited.sessionInfo.sessionName, 'Edited Host C');
            assert.deepEqual(edited.sessionInfo.login_script, []);
            assert.equal(connected.length, 3);

            await tree.getByText('Sessions', { exact: true }).click({ button: 'right' });
            await page.locator('.ant-dropdown:visible .ant-dropdown-menu-submenu-title').hover();
            await page.getByRole('menuitem', { name: /^session$/i }).click();
            const addDialog = page.locator('.ant-modal-wrap:visible');
            await addDialog.locator('input#sessionName').fill('Added Config');
            await addDialog.locator('input#hostname').fill('127.0.0.1');
            await addDialog.locator('input#username').fill('test');
            await addDialog.getByRole('button', { name: /^OK$/i }).click();
            await new Promise((resolve, reject) => {
                const deadline = Date.now() + 3000;
                const check = () => {
                    if (catalogWrites.some((operation) => operation.type === 'addFile'))
                        return resolve();
                    if (Date.now() > deadline)
                        return reject(new Error('Configuration form did not submit'));
                    setTimeout(check, 20);
                };
                check();
            });
            if (await tree.locator('.ant-tree-switcher_close').count())
                await tree.locator('.ant-tree-switcher_close').first().click();
            await tree.getByText('Added Config', { exact: true }).waitFor();
            assert.ok(
                catalogWrites.some(
                    (operation) =>
                        operation.type === 'addFile' &&
                        operation.dir === '/mock' &&
                        operation.fileName === 'Added Config',
                ),
            );
            await page.locator('.ant-modal-wrap:visible').waitFor({ state: 'hidden' });

            await page.evaluate(() => window.__emitIpc('openGlobalSetting'));
            const settings = page.locator('.ant-modal-wrap:visible');
            await settings.getByRole('tab', { name: /variable/i }).waitFor();
            await settings.locator('.ant-modal-close').click();
            await page.locator('.ant-modal-wrap:visible').waitFor({ state: 'hidden' });
            await page.evaluate(() => window.__emitIpc('openManagerNameSpaceModal'));
            const project = page.locator('.ant-modal-wrap:visible');
            await project.getByRole('tab', { name: /namespace/i }).waitFor();
            await project.locator('.ant-modal-close').click();
            await page.locator('.ant-modal-wrap:visible').waitFor({ state: 'hidden' });

            await page.keyboard.press('Control+q');
            await page.locator('.ant-drawer-content').waitFor({ state: 'visible' });
            await page.locator('.ant-drawer-close').click();
            const prevented = await page.evaluate(() => {
                const event = new KeyboardEvent('keydown', {
                    key: 'w',
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true,
                });
                document.dispatchEvent(event);
                return event.defaultPrevented;
            });
            assert.equal(prevented, true);

            await page.locator(`[data-session-tab="${ids[0]}"] .ant-tabs-tab-remove`).click();
            await page
                .locator(`[data-terminal-session="${ids[0]}"]`)
                .waitFor({ state: 'detached' });
            assert.equal(await page.locator('[data-group-id]').count(), 1);
            assert.equal(connected.length, 3);
            assert.equal(closed.length, 1);
            assert.deepEqual(errors, []);
            await page.evaluate(() => {
                location.hash =
                    '/session/detached?sessionId=detached-smoke&label=Detached&tempPath=mock-content';
            });
            await page.waitForFunction(() => document.querySelectorAll('.xterm').length === 1);
            assert.equal(await page.locator('[data-session-tab]').count(), 1);
            assert.equal(await page.locator('[data-group-id]').count(), 1);
            assert.equal(await page.locator('.session-splitter').count(), 0);
            await page
                .locator('[data-session-tab] .ant-tabs-tab-btn')
                .filter({ hasText: 'Detached' })
                .waitFor();
            assert.deepEqual(errors, []);
            assert.equal(
                await page.evaluate(() => window.__ipcListeners.get('selected-file')?.size),
                1,
            );
            assert.equal(
                await page.evaluate(() => window.__ipcListeners.get('openGlobalSetting')?.size),
                1,
            );
            assert.equal(
                await page.evaluate(() => {
                    const event = new KeyboardEvent('keydown', {
                        key: 'w',
                        ctrlKey: true,
                        bubbles: true,
                        cancelable: true,
                    });
                    document.dispatchEvent(event);
                    return event.defaultPrevented;
                }),
                false,
            );
            if (process.env.SCREENSHOT_PATH)
                await page.screenshot({ path: process.env.SCREENSHOT_PATH });
        } catch (error) {
            console.error('App errors:', errors);
            if (page)
                console.error('UI state:', {
                    menus: await page.getByRole('menuitem').allTextContents(),
                    tree: await page.locator('.sessionList').allTextContents(),
                    validation: await page
                        .locator('.ant-form-item-explain-error')
                        .allTextContents(),
                    operations: catalogWrites.map((operation) => operation.type),
                });
            throw error;
        } finally {
            if (browser) await browser.close();
            wss.clients.forEach((socket) => socket.terminate());
            await new Promise((resolve) => wss.close(resolve));
            await new Promise((resolve) => server.close(resolve));
        }
    },
);
