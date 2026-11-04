import React, { createContext, useContext, useLayoutEffect, useState } from 'react';
import { createTransferStore } from './transferStore';
import type { TransferStore } from './transferStore';

const TransferContext = createContext<TransferStore | null>(null);
export const TransferProvider: React.FC = ({ children }) => {
    const [store] = useState(createTransferStore);
    return <TransferContext.Provider value={store}>{children}</TransferContext.Provider>;
};
export function useTransferStore() {
    const store = useContext(TransferContext);
    if (!store) throw new Error('TransferProvider is required');
    return store;
}

function useTransferSnapshot<T>(
    id: string,
    channel: 'files' | 'progress',
    read: (store: TransferStore, key: string) => T,
) {
    const store = useTransferStore();
    const [snapshot, setSnapshot] = useState(() => ({ id, value: read(store, id) }));
    useLayoutEffect(() => {
        const update = () => setSnapshot({ id, value: read(store, id) });
        // 先订阅再读取，避免挂载期间遗漏更新；切换会话时同步更换订阅。
        const unsubscribe = store.subscribe(id, channel, update);
        update();
        return unsubscribe;
    }, [store, id, channel, read]);
    return snapshot.id === id ? snapshot.value : read(store, id);
}
const readFiles = (store: TransferStore, id: string) => store.getFiles(id);
const readProgress = (store: TransferStore, id: string) => store.getProgress(id);
export const useRemoteFiles = (id: string) => useTransferSnapshot(id, 'files', readFiles);
export const useTransferProgress = (id: string) =>
    useTransferSnapshot(id, 'progress', readProgress);
