export interface RemoteFile {
    key: string;
    title: string;
    isLeaf?: boolean;
    remoteDirectory?: string;
}
export interface TransferProgress {
    id: string;
    filePath: string;
    percent: number;
}
type Listener = () => void;
type Channel = 'files' | 'progress';
const EMPTY_FILES: RemoteFile[] = [];
const EMPTY_PROGRESS: TransferProgress[] = [];

/** 按会话与数据种类发布更新；进度变化不会通知终端、目录树或其他会话。 */
export function createTransferStore() {
    const files = new Map<string, RemoteFile[]>();
    const progress = new Map<string, TransferProgress[]>();
    const listeners = new Map<string, Set<Listener>>();
    const notify = (id: string, channel: Channel) =>
        listeners.get(`${id}:${channel}`)?.forEach((listener) => listener());
    return {
        getFiles: (id: string) => files.get(id) || EMPTY_FILES,
        getProgress: (id: string) => progress.get(id) || EMPTY_PROGRESS,
        subscribe(id: string, channel: Channel, listener: Listener) {
            const key = `${id}:${channel}`;
            const entries = listeners.get(key) || new Set<Listener>();
            entries.add(listener);
            listeners.set(key, entries);
            return () => {
                entries.delete(listener);
                if (!entries.size) listeners.delete(key);
            };
        },
        setFiles(id: string, values: RemoteFile[]) {
            files.set(id, values);
            notify(id, 'files');
        },
        updateProgress(id: string, value: TransferProgress) {
            const previous = progress.get(id) || EMPTY_PROGRESS;
            const exists = previous.some((item) => item.id === value.id);
            progress.set(
                id,
                exists
                    ? previous.map((item) =>
                          item.id === value.id ? { ...item, percent: value.percent } : item,
                      )
                    : [...previous, value],
            );
            notify(id, 'progress');
        },
        remove(id: string) {
            files.delete(id);
            progress.delete(id);
            notify(id, 'files');
            notify(id, 'progress');
        },
    };
}
export type TransferStore = ReturnType<typeof createTransferStore>;
