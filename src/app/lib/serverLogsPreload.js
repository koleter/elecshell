const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('serverLogs', {
    read: () => ipcRenderer.invoke('server-logs:read'),
    copy: (text) => ipcRenderer.invoke('server-logs:copy', text),
    openDirectory: () => ipcRenderer.invoke('server-logs:open-directory'),
});
