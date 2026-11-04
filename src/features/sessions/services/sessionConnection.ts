import { getBackendUrl } from '../../../platform/backend';
import { desktop } from '../../../platform/electronBridge';
import { createId } from '../../../shared/id';
import type { Prompt } from '../../dialogs/types';
import type {
    TransferStore,
    RemoteFile,
    TransferProgress,
} from '../../transfers/model/transferStore';
import { sessionRegistry } from '../model/sessionRegistry';
import type {
    ClientMessage,
    Disposable,
    ServerMessage,
    SessionRuntime,
    TerminalPort,
} from '../model/protocol';
import type { Notice, ScriptSessionConfig, SessionCommands, TerminalSession } from '../model/types';
import { sessionService } from './sessionService';

export interface ConnectionOptions {
    getSession: () => TerminalSession;
    terminal: TerminalPort;
    commands: SessionCommands;
    transfers: TransferStore;
    prompt: Prompt;
    notify: (message: Notice) => void;
    onOpen: () => void;
    serialize: () => string;
}

/** 一个连接拥有自己的订阅、回调表和取消信号，关闭时统一释放。 */
class SessionConnection implements SessionRuntime {
    readonly id: string;
    readonly sessionConfId?: string;
    readonly debug: { term: TerminalPort; sock: WebSocket };
    status: SessionRuntime['status'] = 'connecting';
    private readonly options: ConnectionOptions;
    private readonly socket: WebSocket;
    private readonly decoder: TextDecoder;
    private readonly callbacks = new Map<string, (result: string) => void>();
    private readonly subscriptions: Disposable[] = [];
    private readonly cancelled = new AbortController();
    private disposed = false;

    constructor(url: string, options: ConnectionOptions) {
        this.options = options;
        const session = options.getSession();
        this.id = session.key;
        this.sessionConfId = session.sessionConfId;
        this.decoder = new TextDecoder(session.encoding || 'utf-8');
        this.socket = new WebSocket(url);
        this.debug = { term: options.terminal, sock: this.socket };
        this.subscriptions.push(options.terminal.onData((data) => this.sendCommand(data)));
        this.socket.onopen = () => {
            if (this.disposed || sessionRegistry.get(this.id) !== this) return;
            this.status = 'connected';
            sessionRegistry.changed();
            this.subscriptions.push(
                options.terminal.onResize(({ cols, rows }) =>
                    this.send({ type: 'resize', resize: [cols, rows] }),
                ),
            );
            options.onOpen();
        };
        this.socket.onmessage = (event) => {
            if (!this.disposed && sessionRegistry.get(this.id) === this)
                this.receive(JSON.parse(event.data) as ServerMessage);
        };
        this.socket.onerror = (error) => console.error(error);
        this.socket.onclose = () => {
            if (this.disposed) return;
            const ownsSession = sessionRegistry.get(this.id) === this;
            options.terminal.write('\r\nthis session is closed.....');
            this.release();
            // 旧 socket 的关闭事件也不能把接管后的会话错误标记为断开。
            if (!ownsSession) return;
            options.commands.setSessions((previous) =>
                previous.map((item) =>
                    item.key === this.id ? { ...item, isConnected: false } : item,
                ),
            );
        };
        sessionRegistry.remember(session);
        sessionRegistry.register(this);
    }

    send = (message: ClientMessage) => {
        if (!this.disposed && this.socket.readyState === WebSocket.OPEN)
            this.socket.send(JSON.stringify(message));
    };
    sendCommand = (data: string) => this.send({ type: 'data', data });
    requestOutput = (command: string, callback: (result: string) => void) => {
        const requestId = createId();
        this.callbacks.set(requestId, callback);
        this.send({ type: 'sendRecv', data: command, requestId });
    };
    parseOutput = (output: string, callback: (raw: string) => void) =>
        this.options.terminal.write(output, callback, false);
    serialize = () => this.options.serialize();
    close = () => {
        this.release();
        this.socket.close();
    };

    private release() {
        if (this.disposed) return;
        this.disposed = true;
        this.status = 'closed';
        this.cancelled.abort();
        this.callbacks.clear();
        this.subscriptions.splice(0).forEach((subscription) => subscription.dispose());
        this.socket.onopen = null;
        this.socket.onmessage = null;
        this.socket.onclose = null;
        this.socket.onerror = null;
        sessionRegistry.remove(this);
    }
    private decode(value: string) {
        const raw = atob(value);
        return this.decoder.decode(Uint8Array.from(raw, (character) => character.charCodeAt(0)));
    }
    private reply(requestId: string | undefined, args: unknown) {
        if (requestId) this.send({ type: 'callback', requestId, args });
    }
    private refreshRemoteFileList(files: RemoteFile[]) {
        this.options.transfers.setFiles(this.id, [
            { key: '..', title: '..', isLeaf: false },
            ...files,
        ]);
    }
    private refreshFileProgressInfo(progress: TransferProgress) {
        this.options.transfers.updateProgress(this.id, progress);
    }
    private receive(message: ServerMessage) {
        switch (message.type) {
            case 'data':
                this.options.terminal.write(
                    this.decode(message.val),
                    (raw) => {
                        this.reply(message.requestId, raw);
                        const logPath = this.options.getSession().logPath;
                        if (logPath) {
                            try {
                                desktop.appendFile(logPath, raw);
                            } catch (error) {
                                this.options.notify({ status: 'error', content: String(error) });
                            }
                        }
                    },
                    message.showOnTerm,
                );
                break;
            case 'message':
                this.options.notify(message);
                break;
            case 'response': {
                const callback = this.callbacks.get(message.requestId);
                this.callbacks.delete(message.requestId);
                callback?.(this.decode(message.val));
                break;
            }
            case 'execSessionMethod': {
                // 后端的动态方法调用保留在协议边界，不让页面依赖可变方法字典。
                const methods: Record<
                    string,
                    (args: never, callback: (result: unknown) => void) => unknown
                > = {
                    refreshRemoteFileList: this.refreshRemoteFileList.bind(this),
                    refreshFileProgressInfo: this.refreshFileProgressInfo.bind(this),
                    sendData: this.sendCommand,
                    sendRecv: this.requestOutput,
                    send: this.send,
                };
                const method = methods[message.method];
                if (!method) throw new Error(`unexpected session method: ${message.method}`);
                method(message.args as never, (result) => this.reply(message.requestId, result));
                break;
            }
            case 'execMethod':
                if (message.method === 'prompt') {
                    this.options.prompt(
                        String(message.args),
                        (value) => this.reply(message.requestId, value),
                        '',
                        () => {
                            if (message.requestId)
                                this.send({
                                    type: 'del_callback_map',
                                    requestId: message.requestId,
                                });
                        },
                    );
                } else if (message.method === 'createNewSession') {
                    void this.createFromScript(
                        message.args as ScriptSessionConfig[],
                        message.requestId,
                    );
                } else throw new Error(`unexpected method: ${message.method}`);
                break;
            case 'eval': {
                // 兼容现有脚本消息；终端句柄只在连接服务的作用域内提供。
                const term = this.options.terminal;
                const result = eval(`${message.method}('${message.args}')`);
                void term;
                this.reply(message.requestId, result);
                break;
            }
            default:
                throw new Error('unexpected terminal message');
        }
    }
    private async createFromScript(configs: ScriptSessionConfig[], requestId?: string) {
        try {
            const responses = await sessionService.openFromScript(
                configs,
                this.options.commands,
                this.options.getSession().encoding || 'utf-8',
                this.options.notify,
            );
            if (
                await sessionRegistry.waitUntilReady(
                    responses.map((item) => item.id),
                    this.cancelled.signal,
                )
            )
                this.reply(requestId, responses);
        } catch (error) {
            if (!this.disposed) this.options.notify({ status: 'error', content: String(error) });
        }
    }
}

export function connectSession(options: ConnectionOptions): () => void {
    let disposed = false;
    let connection: SessionConnection | undefined;
    void getBackendUrl()
        .then((base) => {
            if (disposed) return;
            const url = new URL('ws', base);
            url.protocol = url.protocol.replace('http', 'ws');
            url.searchParams.set('id', options.getSession().key);
            connection = new SessionConnection(url.toString(), options);
        })
        .catch((error) => {
            if (disposed) return;
            options.notify({ status: 'error', content: String(error) });
            const id = options.getSession().key;
            options.commands.setSessions((previous) =>
                previous.map((item) => (item.key === id ? { ...item, isConnected: false } : item)),
            );
        });
    // 在地址查询、连接中或已连接三个阶段卸载，都不会留下孤立 socket 或脚本等待任务。
    return () => {
        disposed = true;
        connection?.close();
    };
}
