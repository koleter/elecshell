import type { SessionRuntime } from './protocol';
import type { TerminalSession } from './types';

const runtimes = new Map<string, SessionRuntime>();
const names = new Map<string, string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

// Map 不向页面暴露。所有变更都有明确的所有者，旧连接清理不能删除已接管的新连接。
export const sessionRegistry = {
    get: (id: string) => runtimes.get(id),
    name: (id: string) => names.get(id),
    forget(id: string) {
        if (!runtimes.has(id)) names.delete(id);
    },
    remember(session: TerminalSession) {
        if (session.sessionConfPath)
            names.set(
                session.key,
                session.sessionConfPath.split(/[\\/]/).pop() || session.sessionConfPath,
            );
    },
    register(runtime: SessionRuntime) {
        runtimes.set(runtime.id, runtime);
        notify();
    },
    changed: notify,
    remove(runtime: SessionRuntime) {
        if (runtimes.get(runtime.id) !== runtime) return;
        runtimes.delete(runtime.id);
        names.delete(runtime.id);
        notify();
    },
    // 仅供诊断和集成测试核对终端、连接的身份，不提供可变的运行时字典。
    debugSnapshot: () =>
        Object.fromEntries([...runtimes].map(([id, runtime]) => [id, runtime.debug])),
    waitUntilReady(ids: string[], signal?: AbortSignal, timeout = 4000): Promise<boolean> {
        return new Promise((resolve) => {
            let finished = false;
            const timer = setTimeout(abort, timeout);
            function finish(ready: boolean) {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                listeners.delete(check);
                signal?.removeEventListener('abort', abort);
                resolve(ready);
            }
            function check() {
                if (ids.every((id) => runtimes.get(id)?.status === 'connected')) finish(true);
            }
            function abort() {
                finish(false);
            }
            listeners.add(check);
            signal?.addEventListener('abort', abort);
            if (signal?.aborted) abort();
            else check();
        });
    },
};
