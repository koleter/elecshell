/** 会话的界面数据，与终端、WebSocket 实例及布局结构独立。 */
export interface TerminalSession {
    key: string;
    label: string;
    isConnected: boolean;
    encoding?: string;
    logPath?: string;
    sessionConfId?: string;
    sessionConfPath?: string;
}

export interface SessionCommands {
    setSessions: (
        update: TerminalSession[] | ((previous: TerminalSession[]) => TerminalSession[]),
    ) => void;
    activateSession: (id: string) => void;
}

export interface CreateSessionRequest {
    id?: string;
    sessionConfId: string;
    filePath: string;
    sessionName?: string;
}

export interface CreateSessionResponse {
    id: string;
    filePath?: string;
    sessionName?: string;
    sessionConfId?: string;
    encoding?: string;
    status?: string;
    msg?: string;
}

export interface Notice {
    status: string;
    content?: unknown;
    msg?: string;
}

export type ScriptSessionConfig = string | { conf_id: string; session_name?: string };
