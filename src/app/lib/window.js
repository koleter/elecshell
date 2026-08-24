const {app, BrowserWindow, screen, globalShortcut, ipcMain, dialog, webContents} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {switchFileInExploer} = require("./fileDialog");

let dragOverlayWin = null;
let dragMoveTimer = null;

function getDragOverlayWindow() {
    if (dragOverlayWin && !dragOverlayWin.isDestroyed()) return dragOverlayWin;
    dragOverlayWin = new BrowserWindow({
        width: 400,
        height: 200,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        focusable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        fullscreenable: false,
        hasShadow: false,
        show: false,
        acceptFirstMouse: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
        },
    });
    dragOverlayWin.setAlwaysOnTop(true, 'screen-saver');
    dragOverlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    dragOverlayWin.setIgnoreMouseEvents(true, { forward: true });
    dragOverlayWin.on('closed', () => {
        dragOverlayWin = null;
        stopDragMovePolling();
    });
    const overlayHtmlPath = path.join(__dirname, '..', 'drag-overlay.html');
    dragOverlayWin.loadFile(overlayHtmlPath).catch(e => console.error('load drag-overlay failed', e));
    return dragOverlayWin;
}

function startDragMovePolling(offsetX = -40, offsetY = -14) {
    stopDragMovePolling();
    dragMoveTimer = setInterval(() => {
        if (!dragOverlayWin || dragOverlayWin.isDestroyed()) {
            stopDragMovePolling();
            return;
        }
        const cursor = screen.getCursorScreenPoint();
        const display = screen.getDisplayNearestPoint(cursor);
        const workArea = display.workArea;
        const [winW, winH] = dragOverlayWin.getSize();
        let x = cursor.x + offsetX;
        let y = cursor.y + offsetY;
        x = Math.max(workArea.x, Math.min(workArea.x + workArea.width - Math.min(winW, workArea.width), x));
        y = Math.max(workArea.y, Math.min(workArea.y + workArea.height - Math.min(winH, workArea.height), y));
        const [curX, curY] = dragOverlayWin.getPosition();
        if (curX !== x || curY !== y) {
            dragOverlayWin.setBounds({ x, y }, false);
        }
    }, 16);
}

function stopDragMovePolling() {
    if (dragMoveTimer) {
        clearInterval(dragMoveTimer);
        dragMoveTimer = null;
    }
}

ipcMain.handle('show-drag-overlay', async (event, payload) => {
    const {
        label,
        connected = false,
        outside = true,
        clientX = 0,
        clientY = 0,
        offsetX = -40,
        offsetY = -14,
        snapshot,
    } = payload || {};
    const win = getDragOverlayWindow();
    if (!win.webContents.isLoading()) {
        // already loaded, no-op
    } else {
        await new Promise((r) => {
            const done = () => {
                clearTimeout(t);
                r(null);
            };
            const t = setTimeout(done, 500);
            win.webContents.once('did-finish-load', done);
        });
    }
    const snap = snapshot || {};
    const winW = Math.min(800, Math.max(200, snap.width || 400));
    const winH = Math.min(400, Math.max(96, snap.height || 200));
    let sx, sy;
    const cursor = screen.getCursorScreenPoint();
    sx = cursor.x;
    sy = cursor.y;

    // 给定一个屏幕坐标点，返回离它最近的显示器对象
    const display = screen.getDisplayNearestPoint({ x: sx, y: sy });
    const workArea = display.workArea;
    let x = sx + offsetX;
    let y = sy + offsetY;
    x = Math.max(
        workArea.x,
        Math.min(workArea.x + workArea.width - Math.min(winW, workArea.width), x),
    );
    y = Math.max(
        workArea.y,
        Math.min(workArea.y + workArea.height - Math.min(winH, workArea.height), y),
    );
    win.setBounds({ x, y, width: winW, height: winH }, false);
    win.webContents.send(
        'drag-overlay-data',
        Object.assign({ label: label || '', connected, outside }, snap ? { snapshot: snap } : {}),
    );
    win.showInactive();
    startDragMovePolling(offsetX, offsetY);
    return { ok: true };
});

ipcMain.on('update-drag-overlay-data', (event, payload) => {
    if (!dragOverlayWin || dragOverlayWin.isDestroyed()) return;
    if (payload && payload.snapshot) {
        const snap = payload.snapshot;
        const winW = Math.min(800, Math.max(200, snap.width || 400));
        const winH = Math.min(400, Math.max(96, snap.height || 200));
        const [curW, curH] = dragOverlayWin.getSize();
        if (Math.abs(curW - winW) > 4 || Math.abs(curH - winH) > 4) {
            dragOverlayWin.setSize(winW, winH, false);
        }
    }
    dragOverlayWin.webContents.send('drag-overlay-data', payload || {});
});

ipcMain.handle('hide-drag-overlay', async () => {
    stopDragMovePolling();
    if (dragOverlayWin && !dragOverlayWin.isDestroyed()) {
        dragOverlayWin.hide();
        dragOverlayWin.setPosition(-10000, -10000, false);
    }
    return { ok: true };
});

function cleanupDragOverlay() {
    stopDragMovePolling();
    try {
        if (dragOverlayWin && !dragOverlayWin.isDestroyed()) {
            // destroy() 忽略 closable:false, 强制关闭
            dragOverlayWin.removeAllListeners();
            dragOverlayWin.destroy();
        }
    } catch (e) {
        console.error('cleanup drag overlay failed', e);
    }
    dragOverlayWin = null;
}

module.exports.cleanupDragOverlay = cleanupDragOverlay;

ipcMain.on("sendAllWindowsIpcMessage", (event, arg) => {
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((win) => {
        win.webContents.send(arg);
    });
});

ipcMain.on("selectADirectory", async (event, nextChannel) => {
    let result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    if (result.canceled || !result.filePaths.length) {
        return;
    }
    event.sender.send(nextChannel, result.filePaths[0]);
});

ipcMain.on("switchFileInExploer", (event, filePath) => {
    switchFileInExploer(filePath);
});

ipcMain.on('update-title', (event, title) => {
    const curWindow = BrowserWindow.getFocusedWindow();
    if (curWindow) {
        curWindow.setTitle(title);
    }
});

ipcMain.handle('create-detached-window', async (event, data) => {
    const {sessionId, session, initialContent} = data || {};
    const cursor = screen.getCursorScreenPoint();
    const option = {
        title: session?.label || 'elecshell',
        width: 900,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
            allowDisplayingInsecureContent: true,
            allowRunningInsecureContent: true,
            enableRemoteModule: true
        },
        frame: process.platform !== "darwin",
        titleBarOverlay: true,
        fullscreenable: true,
        minimizable: true,
        maximizable: true,
        resizable: true,
        movable: true,
        acceptFirstMouse: true,
        show: false,
    };
    const w = option.width;
    const h = option.height;
    const display = screen.getDisplayNearestPoint(cursor);
    const wa = display.workArea;
    let x = cursor.x - Math.floor(w * 0.25);
    let y = cursor.y - 40;
    x = Math.max(wa.x, Math.min(wa.x + wa.width - w, x));
    y = Math.max(wa.y, Math.min(wa.y + wa.height - h, y));
    option.x = x;
    option.y = y;
    if (process.platform === "darwin") {
        option.titleBarStyle = 'hidden';
    }
    const win = new BrowserWindow(option);
    const webContentsId = win.webContents.id;

    win.on('closed', () => {
        const remaining = BrowserWindow.getAllWindows().filter(w2 => w2 && !w2.isDestroyed() && w2 !== dragOverlayWin);
        if (remaining.length === 0) {
            cleanupDragOverlay();
            if (process.platform !== 'darwin') {
                setTimeout(() => { try { app.quit(); } catch (e) {} }, 0);
            }
        }
    });

    let tempPath = '';
    if (initialContent) {
        tempPath = path.join(os.tmpdir(), `elecshell-detached-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
        try {
            fs.writeFileSync(tempPath, initialContent, 'utf-8');
        } catch (e) {
            console.error('write detached initial content failed', e);
            tempPath = '';
        }
    }

    const query = new URLSearchParams();
    if (sessionId) query.set('sessionId', sessionId);
    if (session?.label) query.set('label', session.label);
    if (session?.encoding) query.set('encoding', session.encoding);
    if (session?.logPath) query.set('logPath', session.logPath);
    if (session?.sessionConfId) query.set('sessionConfId', session.sessionConfId);
    if (session?.sessionConfPath) query.set('sessionConfPath', session.sessionConfPath);
    if (tempPath) query.set('tempPath', tempPath);
    const queryString = query.toString();

    if (process.env.NODE_ENV === 'development') {
        await win.loadURL(`http://localhost:8000/#/session/detached?${queryString}`);
    } else if (process.env.NODE_ENV === 'test_production') {
        await win.loadFile(path.join(__dirname, "../../../antdBuild/index.html"), {
            hash: `/session/detached?${queryString}`
        });
    } else {
        await win.loadFile(path.join(__dirname, "../../antdBuild/index.html"), {
            hash: `/session/detached?${queryString}`
        });
    }

    if (!option.x || !option.y) {
        win.center();
    }
    win.show();
    win.focus();

    win.on('closed', () => {
        if (tempPath) {
            try {
                fs.unlinkSync(tempPath);
            } catch (e) {
                // ignore
            }
        }
    });

    return {webContentsId};
});

ipcMain.on('save-directory-dialog', function (event, arg) {
    const curWindow = BrowserWindow.getFocusedWindow();
    if (curWindow) {
        dialog.showSaveDialog(curWindow, {
            title: arg.title,
            defaultPath: arg.arg.namespace,
            properties: ['openDirectory']
        }).then(function (result) {
            if (result.canceled) {
                return;
            }
            console.log(result);
            event.sender.send(arg.nextChannel, {
                filePath: result.filePath,
                arg: arg.arg
            });
        });
    }
});

ipcMain.on('save-file-dialog', function (event, sessionId) {
    const curWindow = BrowserWindow.getFocusedWindow();
    if (curWindow) {
        dialog.showSaveDialog(curWindow, {
            title: '请选择保存日志的文件',
            properties: ['showHiddenFiles']
        }).then(function (files) {
            if (files) event.sender.send('selected-file', files, sessionId);
        });
    }
});

exports.createWindow = () => {
    const {width, height} = screen.getPrimaryDisplay().workAreaSize;//获取到屏幕的宽度和高度
    // Create the browser window.

    const option = {
        title: 'elecshell',
        width: width * 0.9,
        height: height * 0.9,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            // 下面两行配置使得浏览器可以使用nodejs的模块
            nodeIntegration: true, contextIsolation: false, webSecurity: false, // 禁用安全策略
            allowDisplayingInsecureContent: true, // 允许一个使用 https的界面来展示由 http URLs 传过来的资源
            allowRunningInsecureContent: true, // 允许一个 https 页面运行 http url 里的资源
            enableRemoteModule: true // 打开remote模块
        },
        frame: process.platform !== "darwin",   // 去掉窗口边框 // 取消默认的头部；自定义头部
        // titleBarStyle: 'hidden',  // 隐藏窗口title
        titleBarOverlay: true,  // 用于windows系统,使右上角出现最小化,最大化,关闭三个按钮
        fullscreenable: true,
        autoHideMenuBar: false, // 隐藏菜单栏
        minimizable: true, // 可否最小化
        maximizable: true, // 可否最大化
        resizable: true,  //
        closable: true, // 展示关闭按钮
        fullscreen: false, // MAC下是否可以全屏
        skipTaskbar: false, // 在任务栏中显示窗口
        acceptFirstMouse: true, // 是否允许单击页面来激活窗口
        transparent: false,
        movable: true, // 可否移动
        allowRunningInsecureContent: true, // 允许一个 https 页面运行 http url 里的资源
    };
    // mac上需要设置titleBarStyle = 'hidden'否则不会出现最大化最小化按钮
    if (process.platform === "darwin") {
        option.titleBarStyle = 'hidden';
    }
    const win = new BrowserWindow(option);

    win.on('closed', () => {
        const remaining = BrowserWindow.getAllWindows().filter(w => w && !w.isDestroyed() && w !== dragOverlayWin);
        if (remaining.length === 0) {
            cleanupDragOverlay();
            if (process.platform !== 'darwin') {
                setTimeout(() => { try { app.quit(); } catch (e) {} }, 0);
            }
        }
    });

    // globalShortcut.register("CommandOrControl+W", () => {
    //     //stuff here
    // });

    // 阻止Ctrl+W关闭窗口
    // win.webContents.on('before-input-event', (event, input) => {
    //     if (input.key === 'W' && (input.modifiers.includes('Control') || input.modifiers.includes('Command'))) {
    //         console.log(event, input)
    //         event.preventDefault(); // 阻止默认行为
    //     }
    // });

    // Open the DevTools.
    if (process.env.NODE_ENV === 'development') {
        win.loadURL("http://localhost:8000/#/session");
        win.webContents.on('did-finish-load', () => {
            win.webContents.openDevTools();
        });
    } else if (process.env.NODE_ENV === 'test_production') {
        win.loadFile(path.join(__dirname, "../../../antdBuild/index.html"));
        win.webContents.on('did-finish-load', () => {
            win.webContents.openDevTools();
        });
    } else {
        // win.loadURL("http://localhost:8888/session")
        win.loadFile(path.join(__dirname, "../../antdBuild/index.html"));
        // win.webContents.on('did-finish-load', () => {
        //     win.webContents.openDevTools();
        // });
    }
};
