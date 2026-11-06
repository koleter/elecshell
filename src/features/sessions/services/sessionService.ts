import { backendRequest } from '../../../platform/backend';
import { desktop } from '../../../platform/electronBridge';
import { createId } from '../../../shared/id';
import { configurationIndex } from '../../catalog/services/catalogService';
import { sessionRegistry } from '../model/sessionRegistry';
import type {
    CreateSessionRequest,
    CreateSessionResponse,
    Notice,
    ScriptSessionConfig,
    SessionCommands,
    TerminalSession,
} from '../model/types';

async function createRemoteSession(request: CreateSessionRequest) {
    const response = await backendRequest<CreateSessionResponse>('session', {
        method: 'POST',
        body: JSON.stringify(request),
    });
    if (response.status) throw new Error(response.msg || response.status);
    return response;
}

export const sessionService = {
    // 侧边栏保留“先出现连接中的标签，再等待后端”的交互；脚本批量创建复用相同接口。
    async open(
        request: Omit<CreateSessionRequest, 'id'>,
        commands: SessionCommands,
        encoding?: string,
    ) {
        const session: TerminalSession = {
            key: createId(),
            label: request.sessionName || request.sessionConfId,
            sessionConfId: request.sessionConfId,
            sessionConfPath: request.filePath,
            encoding,
            isConnected: false,
        };
        sessionRegistry.remember(session);
        commands.setSessions((previous) => [...previous, session]);
        commands.activateSession(session.key);
        const response = await createRemoteSession({ ...request, id: session.key });
        commands.setSessions((previous) =>
            previous.map((item) =>
                item.key === response.id ? { ...item, isConnected: true } : item,
            ),
        );
        return response.id;
    },
    async openFromScript(
        configs: ScriptSessionConfig[],
        commands: SessionCommands,
        encoding: string,
        notify: (notice: Notice) => void,
    ) {
        const requests = configs.flatMap((config) => {
            const id = typeof config === 'string' ? config : config.conf_id;
            const filePath = configurationIndex.get(id);
            // 与原脚本接口一致：单个配置无效时提示并跳过，其余配置仍继续创建。
            if (!filePath) {
                notify({ status: 'error', content: `invalid sessionConfId: ${id}` });
                return [];
            }
            return [
                {
                    sessionConfId: id,
                    filePath,
                    sessionName: typeof config === 'string' ? undefined : config.session_name,
                },
            ];
        });
        const responses = await Promise.all(requests.map(createRemoteSession));
        const sessions = responses.map(
            (item, index): TerminalSession => ({
                key: item.id,
                label:
                    item.sessionName ||
                    requests[index].sessionName ||
                    requests[index].sessionConfId,
                sessionConfId: item.sessionConfId || requests[index].sessionConfId,
                sessionConfPath: item.filePath || requests[index].filePath,
                encoding: item.encoding || encoding,
                isConnected: true,
            }),
        );
        sessions.forEach(sessionRegistry.remember);
        commands.setSessions((previous) => [...previous, ...sessions]);
        return responses;
    },
    close(ids: string[], commands: SessionCommands) {
        ids.forEach((id) => {
            sessionRegistry.get(id)?.close();
            sessionRegistry.forget(id);
        });
        const removed = new Set(ids);
        commands.setSessions((previous) => previous.filter((session) => !removed.has(session.key)));
    },
    async detach(session: TerminalSession, commands: SessionCommands) {
        const runtime = sessionRegistry.get(session.key);
        if (!session.isConnected || !runtime) return;
        const content = runtime.serialize();
        runtime.send({ type: 'detach' });
        runtime.close();
        commands.setSessions((previous) => previous.filter((item) => item.key !== session.key));
        await desktop.openDetached(session, content);
    },
    isConnected: (id: string) => sessionRegistry.get(id)?.status === 'connected',
    configurationName: (id: string) => sessionRegistry.name(id),
    sendCommand: (id: string, data: string) => sessionRegistry.get(id)?.sendCommand(data),
    listFiles: (id: string, directory: string) =>
        sessionRegistry.get(id)?.send({
            type: 'exec_worker_method',
            methodName: 'get_remote_file_list',
            args: [directory],
        }),
    uploadFiles: (id: string, files: { name: string; path: string }[], directory: string) =>
        sessionRegistry.get(id)?.send({
            type: 'exec_worker_method',
            methodName: 'upload_files',
            args: [files, directory],
        }),
    runScript(id: string, path: string, scriptType: number) {
        const runtime = sessionRegistry.get(id);
        runtime?.send({
            type: 'exec',
            path,
            scriptType,
            sessionId: id,
            xshConfId: runtime.sessionConfId,
        });
    },
    async readWorkingDirectory(id: string): Promise<string> {
        const runtime = sessionRegistry.get(id);
        if (!runtime) throw new Error('session is closed');
        const output = await runtime.requestOutput('pwd');
        return new Promise((resolve, reject) => {
            runtime.parseOutput(output, (raw) => {
                const directory = raw
                    .split('\n')
                    .slice(1)
                    .find((line) => line.startsWith('/'));
                if (directory) resolve(directory.trimEnd());
                else reject(new Error('can not get pwd, error is ' + output));
            });
        });
    },
};
