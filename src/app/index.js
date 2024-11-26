const {app, BrowserWindow, screen, ipcMain, Menu, globalShortcut, remote, dialog} = require('electron');
const path = require('path');
const request = require('request');
const {exec, spawn} = require('child_process');
const {Platform} = require('./platform/platform');
const {ZN_template} = require('./locales/menu/zh-CN');
const {EN_template} = require('./locales/menu/en-US');
const {createWindow} = require('./lib/window');
const {sleep} = require("./lib/util");
const fetch = require('node-fetch');
const {platform} = require("os");
const {getServerPort} = require("./lib/server");


const menu = Menu.buildFromTemplate(ZN_template);
Menu.setApplicationMenu(menu);

const basePath = Platform.getUserBasePath();

app.whenReady().then(() => {
    globalShortcut.register('CommandOrControl+W', () => {

    });
});

function switchLanguage(lang) {
    let menu;
    if (lang === "en-US") {
        menu = Menu.buildFromTemplate(EN_template);
    } else if (lang === "zh-CN") {
        menu = Menu.buildFromTemplate(ZN_template);
    }
    Menu.setApplicationMenu(menu);
}

ipcMain.on("switchLanguage", (event, arg) => {
    switchLanguage(arg);
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach((win) => {
        win.webContents.send("switchLanguage", arg);
    });
});

async function getLanguage() {
    return await fetch(`http://localhost:${await getServerPort()}/conf?type=ProjectConfig`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    }).then(res => {
        return res.json();
    }).then(data => {
        return data.data.language;
    });
}

// 检测系统中是否存在 `python` 或 `python3` 命令
function detectPythonCommand(callback) {
    const isWindows = platform() === 'win32';
    const checkCommand = (command, callback) => {
        const cmd = isWindows ? `where ${command}` : `which ${command}`;
        exec(cmd, (err, stdout) => {
            if (!err && stdout.trim()) {
                callback(command);
            } else {
                callback(null);
            }
        });
    };

    checkCommand('python3', (python3Command) => {
        if (python3Command) {
            callback(python3Command);
        } else {
            checkCommand('python', (pythonCommand) => {
                callback(pythonCommand);
            });
        }
    });
}

function terminateProcess(process) {
    process.kill('SIGTERM'); // 发送 SIGTERM 信号
    setTimeout(() => {
        if (process.killed) {
        } else {
            process.kill('SIGKILL'); // 发送 SIGKILL 信号
        }
    }, 5000); // 等待 5 秒
}

// 启动 Python 脚本
async function startPythonScript(pythonCommand) {
    if (!pythonCommand) {
        console.error('Python or Python3 command not found');
        return;
    }

    const pythonProcess = spawn(pythonCommand, [`main.py`, `--port=${await getServerPort()}`], {
        detached: false, // 子进程依赖于父进程
        stdio: ['inherit', 'inherit', 'inherit'], // 继承父进程的标准输入输出错误流
        cwd: process.env.NODE_ENV === 'test_production' ? `${path.join(__dirname, "../../server")}` : `${path.join(__dirname, "../../../server")}`
    });

    // 监听子进程的退出事件
    pythonProcess.on('exit', (code, signal) => {
        console.log(`Python process exited with code ${code} and signal ${signal}`);
    });

    // 监听 Node.js 进程的退出事件
    process.on('exit', (code) => {
        console.log(`Node.js process exiting with code ${code}`);
        if (pythonProcess) {
            terminateProcess(pythonProcess);
        }
    });

    // 监听 Node.js 进程的 SIGINT 和 SIGTERM 信号
    process.on('SIGINT', () => {
        console.log('Node.js process received SIGINT');
        if (pythonProcess) {
            terminateProcess(pythonProcess);
        }
        process.exit();
    });

    process.on('SIGTERM', () => {
        console.log('Node.js process received SIGTERM');
        if (pythonProcess) {
            terminateProcess(pythonProcess);
        }
        process.exit();
    });

    console.log('Node.js process started and Python process spawned');
}

function startServer() {
    detectPythonCommand(async (pythonCommand) => {
        if (pythonCommand) {
            await startPythonScript(pythonCommand);
        } else {
            throw new Error('python or python3 command not found, you should install python3');
        }
    });
}

async function waitForServerStart() {
    try {
        while (true) {
            const response = await fetch(`http://localhost:${await getServerPort()}/ping`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                await sleep(1000);
                continue;
            }

            const data = await response.text();
            if (data === "pong") {
                return;
            } else {
                throw new Error(`HTTP error! response: ${data}`);
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function start() {
    // Quit when all windows are closed, except on macOS. There, it's common
    // for applications and their menu bar to stay active until the user quits
    // explicitly with Cmd + Q.
    app.on('window-all-closed', async () => {
        app.quit();
    });

    app.on('activate', () => {
        // On OS X it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });

    // In this file you can include the rest of your app's specific main process
    // code. You can also put them in separate files and import them here.
    // 开发模式自行启动main.py,生产模式创建子进程自动执行
    if (process.env.NODE_ENV !== 'development') {
        startServer();
        await waitForServerStart();
        const language = await getLanguage();
        switchLanguage(language);
        app.on('ready', () => {
            setTimeout(() => {
                createWindow();
            }, 500);
        });
    } else {
        app.on('ready', createWindow);
        const language = await getLanguage();
        switchLanguage(language);
    }
}

start();
