import type { Notice } from './types';

/** HTTP 建立会话后，交互消息保持后端现有协议；动态脚本参数集中在此边界使用 unknown。 */
export type ClientMessage =
    | { type: 'data'; data: string }
    | { type: 'resize'; resize: [number, number] }
    | { type: 'detach' }
    | { type: 'sendRecv'; data: string; requestId: string }
    | { type: 'callback'; requestId: string; args: unknown }
    | { type: 'del_callback_map'; requestId: string }
    | { type: 'recallback'; requestId: string; methodName: string; args: unknown }
    | {
          type: 'exec_worker_method';
          methodName: 'get_remote_file_list' | 'upload_files';
          args: unknown[];
      }
    | { type: 'exec'; path: string; sessionId: string; xshConfId?: string; scriptType: number };

export type ServerMessage =
    | { type: 'data'; val: string; requestId?: string; showOnTerm?: boolean }
    | ({ type: 'message' } & Notice)
    | {
          type: 'execSessionMethod' | 'execMethod';
          method: string;
          args: unknown;
          requestId?: string;
      }
    | { type: 'eval'; method: string; args: string; requestId?: string }
    | { type: 'response'; requestId: string; val: string };

export interface Disposable {
    dispose: () => void;
}
export interface TerminalPort {
    write: (data: string | Uint8Array, processed?: (raw: string) => void, show?: boolean) => void;
    onData: (listener: (data: string) => void) => Disposable;
    onResize: (listener: (size: { cols: number; rows: number }) => void) => Disposable;
}

export interface SessionRuntime {
    readonly id: string;
    readonly sessionConfId?: string;
    readonly status: 'connecting' | 'connected' | 'closed';
    readonly debug: { term: TerminalPort; sock: WebSocket };
    send: (message: ClientMessage) => void;
    sendCommand: (command: string) => void;
    requestOutput: (command: string, callback: (result: string) => void) => void;
    parseOutput: (output: string, callback: (raw: string) => void) => void;
    serialize: () => string;
    close: () => void;
}
