import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { scriptService } from '../services/scriptService';
import { showMessage } from '../../../util';
import type { ScriptDefinition } from './types';
function useScriptsModel() {
    const [scriptData, setScriptData] = useState<ScriptDefinition[]>([]);
    const reloadScripts = useCallback(async () => {
        const res = await scriptService.load();
        if (res.status !== 'success') {
            showMessage(res);
            return;
        }
        setScriptData(res.scriptData || []);
    }, []);
    useEffect(() => {
        void reloadScripts();
    }, [reloadScripts]);
    return useMemo(() => ({ scriptData, reloadScripts }), [scriptData, reloadScripts]);
}
const ScriptsContext = createContext<ReturnType<typeof useScriptsModel> | null>(null);
export const ScriptsProvider: React.FC = ({ children }) => (
    <ScriptsContext.Provider value={useScriptsModel()}>{children}</ScriptsContext.Provider>
);
export function useScripts() {
    const scripts = useContext(ScriptsContext);
    if (!scripts) throw new Error('ScriptsProvider is required');
    return scripts;
}
