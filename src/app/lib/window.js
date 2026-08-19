const {BrowserWindow, screen, globalShortcut, ipcMain, dialog, webContents} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {switchFileInExploer} = require("./fileDialog");

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
    };
    if (process.platform === "darwin") {
        option.titleBarStyle = 'hidden';
    }
    const win = new BrowserWindow(option);
    const webContentsId = win.webContents.id;

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
