// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const {contextBridge, ipcRenderer} = require('electron');
const fs = require('fs');

const electronAPI = {
    // 平台名称
    platform: process.platform,
    ipcRenderer: ipcRenderer,
    FS_appendFileSync: fs.appendFileSync,
    FS_writeFileSync: fs.writeFileSync,
    getVersions() {
        return process.versions;
    },
    ENV: process.env.NODE_ENV,
};

if (process.contextIsolated) {
    try {
        // 基本语法,为window拓展一个属性
        contextBridge.exposeInMainWorld('electron', electronAPI);
    } catch (error) {
        console.error(error);
    }
} else {
    window.electronAPI = electronAPI;
}

