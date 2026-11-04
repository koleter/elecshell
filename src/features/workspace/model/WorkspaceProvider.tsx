import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createWorkspace, getFocusedSession, workspaceReducer } from './layout';
import type { WorkspaceAction, WorkspaceState } from './layout';
import type { SessionCommands, TerminalSession } from '../../sessions/model/types';

interface WorkspaceCommands extends SessionCommands {
    dispatch: Dispatch<WorkspaceAction>;
}
const StateContext = createContext<WorkspaceState | null>(null);
const CommandsContext = createContext<WorkspaceCommands | null>(null);

export const WorkspaceProvider: React.FC<{ initialSession?: TerminalSession }> = ({
    initialSession,
    children,
}) => {
    // 每个窗口独立创建布局，仅驻留内存；始终从一个标签组开始。
    const [state, dispatch] = useReducer(workspaceReducer, null, () =>
        createWorkspace(initialSession ? [initialSession] : []),
    );
    const setSessions: Dispatch<SetStateAction<TerminalSession[]>> = useCallback(
        (update) => dispatch({ type: 'sessions', update }),
        [],
    );
    const activateSession = useCallback(
        (sessionId: string) => dispatch({ type: 'activate', sessionId }),
        [],
    );
    const commands = useMemo(
        () => ({ dispatch, setSessions, activateSession }),
        [setSessions, activateSession],
    );
    return (
        <CommandsContext.Provider value={commands}>
            <StateContext.Provider value={state}>{children}</StateContext.Provider>
        </CommandsContext.Provider>
    );
};

// 操作与数据分开订阅；终端只取稳定的操作入口，不因其他会话状态变化而重建连接。
export function useWorkspaceCommands() {
    const commands = useContext(CommandsContext);
    if (!commands) throw new Error('WorkspaceProvider is required');
    return commands;
}
export function useWorkspaceState() {
    const state = useContext(StateContext);
    if (!state) throw new Error('WorkspaceProvider is required');
    return state;
}
export function useWorkspace() {
    const state = useWorkspaceState();
    return { ...useWorkspaceCommands(), state, activeKey: getFocusedSession(state) };
}
