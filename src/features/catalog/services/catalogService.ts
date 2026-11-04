import { backendRequest } from '../../../platform/backend';
import type { SessionConfiguration, SessionTreeNode } from '../model/types';

interface CatalogResponse {
    status: string;
    msg?: string;
    content?: string;
    sessionConfInfo?: Record<string, string>;
    defaultTreeData?: SessionTreeNode[];
}

type CatalogOperation =
    | { type: 'createDir' | 'duplicate' | 'readFile' | 'deleteFile'; path: string }
    | { type: 'moveFileOrDir' | 'renameDir'; src: string; dst: string }
    | { type: 'editSession'; src: string; sessionInfo: SessionConfiguration }
    | { type: 'addFile'; dir: string; fileName: string; content: string };

// 配置索引属于会话目录领域；只向会话服务提供只读查询入口。
const paths = new Map<string, string>();
export const configurationIndex = {
    replace(values: Record<string, string>) {
        paths.clear();
        Object.entries(values).forEach(([id, path]) => paths.set(id, path));
    },
    get: (id: string) => paths.get(id),
};

export const catalogService = {
    load: () =>
        backendRequest<CatalogResponse>('conf', {
            method: 'GET',
            params: { type: 'SessionConfig' },
            timeout: 10000,
        }),
    update: (operation: CatalogOperation) =>
        backendRequest<CatalogResponse>('conf', {
            method: 'POST',
            body: JSON.stringify({ type: 'SessionConfig', args: operation }),
        }),
};
