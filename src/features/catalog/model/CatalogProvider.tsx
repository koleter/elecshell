import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { catalogService, configurationIndex } from '../services/catalogService';
import type { SessionTreeNode } from './types';
import { showMessage } from '../../../util';

function useCatalogModel() {
    const [treeData, setTreeData] = useState<SessionTreeNode[]>([]);
    const reloadCatalog = useCallback(async () => {
        const res = await catalogService.load();
        if (res.status !== 'success') {
            showMessage(res);
            return;
        }
        configurationIndex.replace(res.sessionConfInfo || {});
        setTreeData(res.defaultTreeData || []);
    }, []);
    useEffect(() => {
        void reloadCatalog();
    }, [reloadCatalog]);
    return useMemo(
        () => ({ treeData, sessionRootKey: treeData[0]?.key || '', reloadCatalog }),
        [treeData, reloadCatalog],
    );
}
const CatalogContext = createContext<ReturnType<typeof useCatalogModel> | null>(null);
export const CatalogProvider: React.FC = ({ children }) => (
    <CatalogContext.Provider value={useCatalogModel()}>{children}</CatalogContext.Provider>
);
export function useCatalog() {
    const catalog = useContext(CatalogContext);
    if (!catalog) throw new Error('CatalogProvider is required');
    return catalog;
}
