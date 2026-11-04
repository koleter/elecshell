import type { TerminalSession } from '../features/sessions/model/types';

interface IpcEvents {
    'selected-file': [result: { canceled: boolean; filePath: string }, sessionId: string];
    openGlobalSetting: [];
    refreshConfigableGlobalConfig: [];
    refreshGlobalVariableConfig: [];
    switchLanguage: [language: string];
    importNamespace: [directoryPath: string];
    exportNamespace: [selection: { filePath: string; arg: { namespace: string } }];
    openManagerNameSpaceModal: [];
}
interface IpcCommands {
    sendAllWindowsIpcMessage: [
        channel: 'refreshConfigableGlobalConfig' | 'refreshGlobalVariableConfig',
    ];
    switchLanguage: [language: string];
    'save-directory-dialog': [
        options: { nextChannel: 'exportNamespace'; arg: { namespace: string } },
    ];
    selectADirectory: [nextChannel: 'importNamespace'];
    switchFileInExploer: [path: string];
}

export interface DragOverlayPayload {
    label: string;
    connected: boolean;
    outside: boolean;
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
}

// Electron 的具体通道和宿主对象只在适配层访问，业务模块可替换此层进行浏览器测试。
export const desktop = {
    get platform(): string {
        return window.electronAPI.platform;
    },
    serverPort: (): Promise<number> => window.electronAPI.ipcRenderer.invoke('request-server-port'),
    setTitle: (title: string) => window.electronAPI.ipcRenderer.send('update-title', title),
    selectLogFile: (sessionId: string) =>
        window.electronAPI.ipcRenderer.send('save-file-dialog', sessionId),
    openDetached: (session: TerminalSession, content: string): Promise<void> =>
        window.electronAPI.ipcRenderer.invoke('create-detached-window', {
            sessionId: session.key,
            session: { ...session },
            initialContent: content,
        }),
    writeFile: (path: string, content: string) =>
        window.electronAPI.FS_writeFileSync(path, content),
    appendFile: (path: string, content: string) =>
        window.electronAPI.FS_appendFileSync(path, content),
    readFile: (path: string): string => window.electronAPI.FS_readFileSync(path, 'utf-8'),
    removeFile: (path: string) => window.electronAPI.FS_unlinkSync(path),
    showDragOverlay: (payload: DragOverlayPayload) => window.electronAPI.showDragOverlay?.(payload),
    hideDragOverlay: () => window.electronAPI.hideDragOverlay?.(),
    // 设置页保留宿主现有通道；订阅统一返回解绑函数，避免遗漏清理。
    send<K extends keyof IpcCommands>(channel: K, ...args: IpcCommands[K]) {
        window.electronAPI.ipcRenderer.send(channel, ...args);
    },
    on<K extends keyof IpcEvents>(
        channel: K,
        listener: (event: unknown, ...args: IpcEvents[K]) => void,
    ): () => void {
        const ipc = window.electronAPI.ipcRenderer;
        ipc.on(channel, listener);
        return () => ipc.removeListener(channel, listener);
    },
};
