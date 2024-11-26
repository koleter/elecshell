const {app, BrowserWindow, Menu, dialog} = require('electron');
// const { BrowserWindow } = require('electron').remote;
const {createWindow} = require("./window");

exports.ZN_template = [
    {
        label: '文件',
        submenu: [
            {
                label: '打开新窗口',
                accelerator: 'Ctrl+O',
                click() {
                    createWindow();
                }
            },
            {
                label: '设置',
                accelerator: 'Ctrl+Alt+S',
                click() {
                    var curWindow = BrowserWindow.getFocusedWindow();
                    curWindow.webContents.send("openGlobalSetting");
                }
            },
            {
                label: '全局配置',
                click() {
                    var curWindow = BrowserWindow.getFocusedWindow();
                    curWindow.webContents.send("openManagerNameSpaceModal");
                }
            }
        ]
    },
    {
        label: '编辑',
        submenu: [{
            label: '撤销',
            accelerator: 'CmdOrCtrl+Z',
            role: 'undo'
        }, {
            label: '重做',
            accelerator: 'Shift+CmdOrCtrl+Z',
            role: 'redo'
        }, {
            type: 'separator'
        }, {
            label: '剪切',
            accelerator: 'CmdOrCtrl+X',
            role: 'cut'
        }, {
            label: '复制',
            accelerator: 'CmdOrCtrl+C',
            role: 'copy'
        }, {
            label: '粘贴',
            accelerator: 'CmdOrCtrl+V',
            role: 'paste'
        }, {
            label: '全选',
            accelerator: 'CmdOrCtrl+A',
            role: 'selectall'
        }]
    },
    {
        label: '查看',
        submenu: [
            {
                label: '重载',
                accelerator: 'CmdOrCtrl+R',
                click: function (item, focusedWindow) {
                    if (focusedWindow) {
                        // 重载之后, 刷新并关闭所有的次要窗体
                        if (focusedWindow.id === 1) {
                            BrowserWindow.getAllWindows().forEach(function (win) {
                                if (win.id > 1) {
                                    win.close();
                                }
                            });
                        }
                        focusedWindow.reload();
                    }
                }
            },
            {
                label: '切换全屏',
                accelerator: (function () {
                    if (process.platform === 'darwin') {
                        return 'Ctrl+Command+F';
                    } else {
                        return 'F11';
                    }
                })(),
                click: function (item, focusedWindow) {
                    if (focusedWindow) {
                        focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
                    }
                }
            }, {
                label: '切换开发者工具',
                accelerator: (function () {
                    if (process.platform === 'darwin') {
                        return 'Alt+Command+I';
                    } else {
                        return 'Ctrl+Shift+I';
                    }
                })(),
                click: function (item, focusedWindow) {
                    if (focusedWindow) {
                        focusedWindow.toggleDevTools();
                    }
                }
            }, {
                type: 'separator'
            }, {
                label: '应用程序菜单演示',
                click: function (item, focusedWindow) {
                    if (focusedWindow) {
                        const options = {
                            type: 'info',
                            title: '应用程序菜单演示',
                            buttons: ['好的'],
                            message: '此演示用于 "菜单" 部分, 展示如何在应用程序菜单中创建可点击的菜单项.'
                        };
                        dialog.showMessageBox(focusedWindow, options, function () {
                        });
                    }
                }
            }]
    }, {
        label: '窗口',
        role: 'window',
        submenu: [{
            label: '最小化',
            accelerator: 'CmdOrCtrl+M',
            role: 'minimize'
        }, {
            label: '关闭',
            accelerator: 'CmdOrCtrl+W',
            role: 'close'
        }, {
            type: 'separator'
        }, {
            label: '重新打开窗口',
            accelerator: 'CmdOrCtrl+Shift+T',
            enabled: false,
            key: 'reopenMenuItem',
            click: function () {
                app.emit('activate');
            }
        }]
    }, {
        label: '帮助',
        role: 'help',
        submenu: [{
            label: '学习更多',
            click: function () {
                shell.openExternal('http://electron.atom.io');
            }
        }]
    }
];

exports.EN_template = [
    {
        label: 'File',
        submenu: [
            {
                label: 'Open new window',
                accelerator: 'Ctrl+O',
                click() {
                    createWindow();
                }
            },
            {
                label: 'Settings',
                accelerator: 'Ctrl+Alt+S',
                click() {
                    var curWindow = BrowserWindow.getFocusedWindow();
                    curWindow.webContents.send("openGlobalSetting");
                }
            },
            {
                label: 'Global Configuration',
                click() {
                    var curWindow = BrowserWindow.getFocusedWindow();
                    curWindow.webContents.send("openManagerNameSpaceModal");
                }
            }
        ]
    },
    {
        label: 'Edit',
        submenu: [{
            label: 'Undo',
            accelerator: 'CmdOrCtrl+Z',
            role: 'undo'
        }, {
            label: 'Redo',
            accelerator: 'Shift+CmdOrCtrl+Z',
            role: 'redo'
        }, {
            type: 'separator'
        }, {
            label: 'Cut',
            accelerator: 'CmdOrCtrl+X',
            role: 'cut'
        }, {
            label: 'Copy',
            accelerator: 'CmdOrCtrl+C',
            role: 'copy'
        }, {
            label: 'Paste',
            accelerator: 'CmdOrCtrl+V',
            role: 'paste'
        }, {
            label: 'Select All',
            accelerator: 'CmdOrCtrl+A',
            role: 'selectall'
        }]
    },
    {
        label: 'View',
        submenu: [
            {
                label: 'Reload',
                accelerator: 'CmdOrCtrl+R',
                click: function (item, focusedWindow) {
                    if (focusedWindow) {
                    // After reloading, refresh and close all secondary windows
                        if (focusedWindow.id === 1) {
                            BrowserWindow.getAllWindows().forEach(function (win) {
                                if (win.id > 1) {
                                    win.close();
                                }
                            });
                        }
                        focusedWindow.reload();
                    }
                }
            },
            {
                label: 'Switch full screen',
                accelerator: (function () {
                    if (process.platform === 'darwin') {
                        return 'Ctrl+Command+F';
                    } else {
                        return 'F11';
                    }
                })(),
                click: function (item, focusedWindow) {
                    if (focusedWindow) {
                        focusedWindow.setFullScreen(!focusedWindow.isFullScreen());
                    }
                }
            }, {
                label: 'Toggle developer tools',
                accelerator: (function () {
                    if (process.platform === 'darwin') {
                        return 'Alt+Command+I';
                    } else {
                        return 'Ctrl+Shift+I';
                    }
                })(),
                click: function (item, focusedWindow) {
                    if (focusedWindow) {
                        focusedWindow.toggleDevTools();
                    }
                }
            }, {
                type: 'separator'
            }, {
                label: 'Application menu demo',
                click: function (item, focusedWindow) {
                    if (focusedWindow) {
                        const options = {
                            type: 'info',
                            title: 'Application menu demo',
                            buttons: ['OK'],
                            message: 'This demo is for the "Menu" section, Shows how to create clickable menu items in an application menu.'
                        };
                        dialog.showMessageBox(focusedWindow, options, function () {
                        });
                    }
                }
            }]
    }, {
        label: 'Window',
        role: 'window',
        submenu: [{
            label: 'Minimize',
            accelerator: 'CmdOrCtrl+M',
            role: 'minimize'
        }, {
            label: 'Close',
            accelerator: 'CmdOrCtrl+W',
            role: 'close'
        }, {
            type: 'separator'
        }, {
            label: 'Reopen Window',
            accelerator: 'CmdOrCtrl+Shift+T',
            enabled: false,
            key: 'reopenMenuItem',
            click: function () {
                app.emit('activate');
            }
        }]
    }, {
        label: 'Help',
        role: 'help',
        submenu: [{
            label: 'Learn more',
            click: function () {
                shell.openExternal('http://electron.atom.io');
            }
        }]
    }
];
