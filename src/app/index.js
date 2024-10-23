const {app, BrowserWindow, screen, ipcMain, Menu, globalShortcut, remote} = require('electron');
const path = require('path');
const request = require('request');
const {exec, spawn} = require('child_process');
const {Platform} = require('./platform/platform');
const {template} = require('./lib/menu');
const {createWindow} = require('./lib/window');
const {sleep} = require("./lib/util");
const fetch = require('node-fetch');

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

const basePath = Platform.getUserBasePath();

function startServer() {
    const extraArgs = '';
    // const extraArgs = `--basedir=${basePath}`;
    const args = {
        cwd: process.env.NODE_ENV == 'test_production' ? `${path.join(__dirname, "../../server")}` : `${path.join(__dirname, "../../../server")}`
    };

    function handleError(error) {
        if (error.toString().match(/ModuleNotFoundError:.+?/)) {
            throw new Error(`${error}`);
        }
    }

    exec(`python3 main.py ${extraArgs}`, args, (error, stdout, stderr) => {
        if (!error) {
            return;
        }
        handleError(error);

        if (error.message.indexOf("python3: command not found") >= 0 || error.message === "Command failed: python3 main.py \n") {
            exec(`python main.py ${extraArgs}`, args, (error, stdout, stderr) => {
                if (!error) {
                    return;
                }
                throw error;
            });
            return;
        }
        throw error;
    });
}

async function waitForServerStart() {
    try {
        while (true) {
            const response = await fetch('http://localhost:8888/ping', {
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
    // app.on('quit', async () => {
    //     if (process.env.NODE_ENV !== 'development') {
    //         await request({
    //             url: 'http://localhost:8888/exit',
    //             method: "POST",
    //             json: true,
    //             headers: {
    //                 "content-type": "application/json",
    //             }
    //         }, function (error, response, body) {
    //             if (!error) {
    //                 console.log(body); // 请求成功的处理逻辑
    //             }
    //         });
    //     }
    // });

    // Quit when all windows are closed, except on macOS. There, it's common
    // for applications and their menu bar to stay active until the user quits
    // explicitly with Cmd + Q.
    app.on('window-all-closed', async () => {
        if (process.env.NODE_ENV !== 'development') {
            await request('http://localhost:8888/exit',{
                method: "POST",
                json: true,
                headers: {
                    "content-type": "application/json",
                }
            }, function (error, response, body) {
                if (!error) {
                    console.log(body); // 请求成功的处理逻辑
                }
            });
        }
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
        app.on('ready', () => {
            setTimeout(() => {
                createWindow();
            }, 500);
        });
    } else {
        app.on('ready', createWindow);
    }
}

start();
