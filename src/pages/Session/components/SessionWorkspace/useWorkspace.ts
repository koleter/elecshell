import {useCallback, useReducer} from 'react';
import type {Dispatch, SetStateAction} from 'react';
import {createWorkspace, workspaceReducer} from './layout';
import type {TerminalSession} from './layout';

export default function useWorkspace(initialSession?: TerminalSession) {
    // 布局仅保存在当前窗口内存中；主窗口和接管会话的独立窗口都从单屏开始。
    const [state, dispatch] = useReducer(workspaceReducer, null, () =>
        createWorkspace(initialSession ? [initialSession] : []));

    // 保持原先 setSessions 的调用方式，让侧边栏和脚本都通过同一 reducer 同步布局。
    const setSessions: Dispatch<SetStateAction<TerminalSession[]>> = useCallback(update => {
        dispatch({type: 'sessions', update});
    }, []);
    const activateSession = useCallback((sessionId: string) => dispatch({type: 'activate', sessionId}), []);

    return {state, dispatch, setSessions, activateSession};
}
