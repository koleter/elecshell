const {app, BrowserWindow, Menu, dialog} = require('electron');
// const { BrowserWindow } = require('electron').remote;
const {createWindow} = require("../../lib/window");


exports.EN_template = [
    {
        label: 'File',
        submenu: [
            {
                label: 'New window',
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
