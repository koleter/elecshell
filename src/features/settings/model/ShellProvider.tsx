import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { settingsService } from '../services/settingsService';
import { NENU_SESSIONS } from '../../../const';

function useShellModel() {
    const [xshListWindowWidth, setXshListWindowWidth] = useState(250);
    const [selectedMenuKey, setSelectedMenuKey] = useState(NENU_SESSIONS);
    useEffect(() => {
        let active = true;
        settingsService.loadShell().then((res) => {
            if (active && res.status === 'success' && res.data?.xshListWindowWidth)
                setXshListWindowWidth(res.data.xshListWindowWidth);
        });
        return () => {
            active = false;
        };
    }, []);
    const saveSidebarWidth = useCallback(
        (width: number) => settingsService.saveSidebarWidth(width),
        [],
    );
    return useMemo(
        () => ({
            xshListWindowWidth,
            setXshListWindowWidth,
            selectedMenuKey,
            setSelectedMenuKey,
            saveSidebarWidth,
        }),
        [xshListWindowWidth, selectedMenuKey, saveSidebarWidth],
    );
}
const ShellContext = createContext<ReturnType<typeof useShellModel> | null>(null);
export const ShellProvider: React.FC = ({ children }) => (
    <ShellContext.Provider value={useShellModel()}>{children}</ShellContext.Provider>
);
export function useShell() {
    const shell = useContext(ShellContext);
    if (!shell) throw new Error('ShellProvider is required');
    return shell;
}
