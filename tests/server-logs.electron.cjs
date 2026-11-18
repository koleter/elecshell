const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('playwright');

const root = path.resolve(__dirname, '..');

test('Electron: server logs menu, live file updates, rotation and window lifecycle', { timeout: 60000 }, async (t) => {
    const output = await fs.mkdtemp(path.join(os.tmpdir(), 'elecshell-server-logs-'));
    const basePath = path.join(output, 'elecshell');
    const logDirectory = path.join(basePath, 'logs');
    const logPath = path.join(logDirectory, 'server.log');
    let app;
    try {
        await fs.mkdir(logDirectory, { recursive: true });
        const harness = path.join(output, 'main.cjs');
        await fs.writeFile(harness, `
            const { app, BrowserWindow, Menu, clipboard, shell } = require('electron');
            app.setPath('userData', ${JSON.stringify(path.join(output, 'profile'))});
            process.env.XDG_CONFIG_HOME = ${JSON.stringify(output)};
            process.env.LOCALAPPDATA = ${JSON.stringify(output)};
            const { Platform } = require(${JSON.stringify(path.join(root, 'src/app/platform/platform.js'))});
            Platform.getUserBasePath = () => ${JSON.stringify(basePath)};
            clipboard.writeText = (text) => { global.copied = text; };
            shell.openPath = async (directory) => { global.openedDirectory = directory; return ''; };
            global.logReads = 0;
            const { ipcMain } = require('electron');
            const handle = ipcMain.handle.bind(ipcMain);
            ipcMain.handle = (channel, listener) => handle(channel, (...args) => {
                if (channel === 'server-logs:read') global.logReads++;
                return listener(...args);
            });
            const { ZN_template } = require(${JSON.stringify(path.join(root, 'src/app/locales/menu/zh-CN.js'))});
            const { EN_template } = require(${JSON.stringify(path.join(root, 'src/app/locales/menu/en-US.js'))});
            global.setLanguage = language => Menu.setApplicationMenu(Menu.buildFromTemplate(
                language === 'en-US' ? EN_template : ZN_template));
            app.whenReady().then(async () => {
                global.mainWindow = new BrowserWindow({ show: false });
                await global.mainWindow.loadURL('about:blank');
                global.setLanguage('zh-CN');
            });
        `);
        app = await _electron.launch({ args: [harness], env: { ...process.env, NODE_ENV: 'test' }, timeout: 15000 });
        await app.firstWindow();
        const open = async (english = false) => {
            await app.evaluate(({ Menu }, en) => {
                const view = Menu.getApplicationMenu().items.find(item => item.label === (en ? 'View' : '查看'));
                const logs = view.submenu.items.find(item => item.label === (en ? 'Server Logs' : '服务端日志'));
                if (!logs) throw new Error('Server logs menu entry missing');
                logs.click();
            }, english);
            const page = app.windows().find(item => item.url().includes('server-logs.html')) || await app.waitForEvent('window');
            page.setDefaultTimeout(5000);
            await page.waitForFunction(() => !!window.serverLogs && !!document.getElementById('logs'));
            return page;
        };
        let page = await open();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));

        await t.test('missing file recovers automatically and only the latest 1000 lines are shown', async () => {
            await page.waitForFunction(() => document.getElementById('status').textContent.includes('尚未生成'));
            const lines = Array.from({ length: 1200 }, (_, index) => `日志 ${index + 1} 中文正常`);
            await fs.writeFile(logPath, lines.join('\n') + '\n');
            await page.waitForFunction(() => document.getElementById('logs').value.endsWith('日志 1200 中文正常'));
            const shown = await page.locator('#logs').inputValue();
            assert.equal(shown.split('\n').length, 1000);
            assert.ok(shown.startsWith('日志 201 中文正常'));
            assert.equal(await page.locator('#path').textContent(), logPath);
            assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
        });

        await t.test('scrolling up preserves the reading position while new logs arrive', async () => {
            await page.locator('#logs').evaluate(element => { element.scrollTop = 200; });
            await page.waitForFunction(() => document.getElementById('status').textContent.includes('滚动到底部'));
            await fs.appendFile(logPath, 'new-live-line\n');
            await page.waitForFunction(() => document.getElementById('logs').value.endsWith('new-live-line'));
            assert.ok(await page.locator('#logs').evaluate(element => element.scrollTop < 250));
            await page.locator('#logs').evaluate(element => { element.scrollTop = element.scrollHeight; });
            await fs.appendFile(logPath, 'follow-bottom-line\n');
            await page.waitForFunction(() => {
                const element = document.getElementById('logs');
                return element.value.endsWith('follow-bottom-line') && element.scrollHeight - element.clientHeight - element.scrollTop < 24;
            });
        });

        await t.test('copy, open directory, singleton, truncation and rotation', async () => {
            await page.locator('#copy').click();
            assert.equal(await app.evaluate(() => global.copied), await page.locator('#logs').inputValue());
            await page.locator('#open-directory').click();
            assert.equal(await app.evaluate(() => global.openedDirectory), logDirectory);
            await open();
            assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 2);
            await fs.writeFile(logPath, '超长行'.repeat(150000));
            await page.locator('#refresh').click();
            await page.waitForFunction(() => document.getElementById('logs').value.length > 100000);
            assert.ok(!(await page.locator('#logs').inputValue()).includes('\ufffd'));
            await fs.rename(logPath, logPath + '.1');
            await fs.writeFile(logPath, 'rotated-log\n');
            await page.waitForFunction(() => document.getElementById('logs').value === 'rotated-log');
            await fs.truncate(logPath, 0);
            await page.waitForFunction(() => document.getElementById('logs').value === '');
            await fs.writeFile(logPath, '<script>window.injected = true</script>\nTraceback:\n  中文堆栈\n');
            await page.waitForFunction(() => document.getElementById('logs').value.includes('中文堆栈'));
            assert.equal(await page.evaluate(() => window.injected), undefined);
        });

        await t.test('closing stops reads and the window reopens from the English View menu', async () => {
            await page.close();
            const readCount = await app.evaluate(() => global.logReads);
            await new Promise(resolve => setTimeout(resolve, 1200));
            assert.equal(await app.evaluate(() => global.logReads), readCount);
            assert.equal(await app.evaluate(() => global.mainWindow.isDestroyed()), false);
            await app.evaluate(() => global.setLanguage('en-US'));
            page = await open(true);
            await page.waitForFunction(() => document.getElementById('heading').textContent === 'Server Logs');
            assert.equal(await page.locator('#refresh').textContent(), 'Refresh');
            await page.waitForFunction(() => document.getElementById('logs').value.includes('中文堆栈'));
            assert.deepEqual(errors, []);
        });
    } finally {
        if (app) await app.close();
        await fs.rm(output, { recursive: true, force: true });
    }
});
