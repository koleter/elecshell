import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { settingsService } from '../services/settingsService';
import { showMessage } from '../../../util';
import type { VariableItem } from './types';

function useSettingsModel() {
    const [connectVariable, setConnectVariable] = useState<VariableItem[]>([]);
    const [globalConnectVariable, setGlobalConnectVariable] = useState<VariableItem[]>([]);
    const reloadProjectVariables = useCallback(async () => {
        const res = await settingsService.loadVariables('ConfigableProjectConfig');
        if (res.status === 'success') setConnectVariable(res.data?.strVariableSetting || []);
        else showMessage(res);
    }, []);
    const reloadGlobalVariables = useCallback(async () => {
        const res = await settingsService.loadVariables('GlobalVariableConfig');
        if (res.status === 'success') setGlobalConnectVariable(res.data?.strVariableSetting || []);
        else showMessage(res);
    }, []);
    useEffect(() => {
        void reloadProjectVariables();
        void reloadGlobalVariables();
    }, [reloadProjectVariables, reloadGlobalVariables]);
    return useMemo(
        () => ({
            connectVariable,
            setConnectVariable,
            globalConnectVariable,
            setGlobalConnectVariable,
            reloadProjectVariables,
            reloadGlobalVariables,
        }),
        [connectVariable, globalConnectVariable, reloadProjectVariables, reloadGlobalVariables],
    );
}
const SettingsContext = createContext<ReturnType<typeof useSettingsModel> | null>(null);
export const SettingsProvider: React.FC = ({ children }) => (
    <SettingsContext.Provider value={useSettingsModel()}>{children}</SettingsContext.Provider>
);
export function useSettings() {
    const settings = useContext(SettingsContext);
    if (!settings) throw new Error('SettingsProvider is required');
    return settings;
}
