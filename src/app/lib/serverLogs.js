const { BrowserWindow, clipboard, ipcMain, shell } = require('electron');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { Platform } = require('../platform/platform');

const MAX_LINES = 1000;
const MAX_BYTES = 1024 * 1024;
let logWindow = null;
let windowLanguage = null;

function getLogDirectory() {
    // 与 Python appdirs.user_config_dir 的平台规则保持一致。
    let basePath = Platform.getUserBasePath();
    if (process.platform === 'linux') {
        basePath = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'elecshell');
    } else if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        basePath = path.join(process.env.LOCALAPPDATA, 'elecshell');
    }
    return path.join(basePath, 'logs');
}

async function readLog() {
    const logPath = path.join(getLogDirectory(), 'server.log');
    let file;
    try {
        file = await fs.open(logPath, 'r');
        const { size } = await file.stat();
        const offset = Math.max(0, size - MAX_BYTES);
        const buffer = Buffer.alloc(Math.min(size, MAX_BYTES));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, offset);
        let content = buffer.subarray(0, bytesRead);
        let truncated = false;
        if (offset > 0) {
            const newline = content.indexOf(10);
            if (newline >= 0) {
                // 从完整的一行开始，避免切断 UTF-8 字符。
                content = content.subarray(newline + 1);
            } else {
                let start = 0;
                while (start < content.length && (content[start] & 0xc0) === 0x80) start++;
                content = content.subarray(start);
                truncated = true;
            }
        }
        const lines = content.toString('utf8').split('\n');
        if (lines[lines.length - 1] === '') lines.pop();
        return { path: logPath, text: lines.slice(-MAX_LINES).join('\n'), state: 'ready', truncated };
    } catch (error) {
        return {
            path: logPath,
            text: '',
            state: error.code === 'ENOENT' ? 'missing' : 'error',
            error: error.message,
        };
    } finally {
        if (file) await file.close();
    }
}

function verifySender(event) {
    if (!logWindow || logWindow.isDestroyed() || event.sender !== logWindow.webContents ||
        event.senderFrame !== event.sender.mainFrame) {
        throw new Error('Server log window required');
    }
}

ipcMain.handle('server-logs:read', (event) => {
    verifySender(event);
    return readLog();
});

ipcMain.handle('server-logs:copy', (event, text) => {
    verifySender(event);
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
        throw new Error('Invalid log text');
    }
    clipboard.writeText(text);
});

ipcMain.handle('server-logs:open-directory', (event) => {
    verifySender(event);
    return shell.openPath(getLogDirectory());
});

exports.openServerLogsWindow = (language = 'zh-CN') => {
    const locale = language === 'en-US' ? 'en-US' : 'zh-CN';
    if (!logWindow || logWindow.isDestroyed()) {
        logWindow = new BrowserWindow({
            title: locale === 'en-US' ? 'Server Logs' : '服务端日志',
            width: 1000,
            height: 650,
            minWidth: 560,
            minHeight: 360,
            backgroundColor: '#ffffff',
            show: false,
            webPreferences: {
                preload: path.join(__dirname, 'serverLogsPreload.js'),
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
            },
        });
        const win = logWindow;
        win.once('ready-to-show', () => {
            if (!win.isDestroyed()) win.show();
        });
        win.on('closed', () => {
            logWindow = null;
            windowLanguage = null;
        });
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        win.webContents.on('will-navigate', (event) => event.preventDefault());
    }
    if (windowLanguage !== locale) {
        windowLanguage = locale;
        logWindow.setTitle(locale === 'en-US' ? 'Server Logs' : '服务端日志');
        const htmlPath = process.env.NODE_ENV === 'production'
            ? path.join(__dirname, 'server-logs.html')
            : path.join(__dirname, '..', 'server-logs.html');
        logWindow.loadFile(htmlPath, { query: { language: locale } }).catch((error) => {
            windowLanguage = null;
            console.error('Failed to load server logs window', error);
        });
    }
    if (logWindow.isMinimized()) logWindow.restore();
    logWindow.focus();
    return logWindow;
};
