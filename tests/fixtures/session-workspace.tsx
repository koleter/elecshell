import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import SessionWorkspace from '../../src/features/workspace/components/SessionWorkspace';
import TerminalView from '../../src/features/terminal/components/TerminalView';
import {
    WorkspaceProvider,
    useWorkspace,
} from '../../src/features/workspace/model/WorkspaceProvider';
import { PromptProvider } from '../../src/features/dialogs/PromptProvider';
import {
    TransferProvider,
    useRemoteFiles,
    useTransferProgress,
} from '../../src/features/transfers/model/TransferProvider';
import { configurationIndex } from '../../src/features/catalog/services/catalogService';
import { sessionRegistry } from '../../src/features/sessions/model/sessionRegistry';
import { sessionService } from '../../src/features/sessions/services/sessionService';
import 'antd/dist/antd.css';

const host = window as any;
configurationIndex.replace({
    A: '/configs/A',
    B: '/configs/B',
    C: '/configs/C',
    D: '/configs/D',
    E: '/configs/E',
    F: '/configs/F',
});
host.detaches = [];
host.nativeCalls = [];
host.renderCounts = { workspace: 0, 'progress-A': 0, 'progress-B': 0, 'files-A': 0 };
host.electronAPI = {
    platform: 'linux',
    FS_appendFileSync: () => undefined,
    ipcRenderer: { invoke: async () => undefined },
    showDragOverlay: async (payload: unknown) => {
        host.nativeCalls.push(['show', payload]);
    },
    hideDragOverlay: async () => {
        host.nativeCalls.push(['hide']);
    },
};

function ProgressProbe({ id }: { id: string }) {
    const progress = useTransferProgress(id);
    host.renderCounts[`progress-${id}`] += 1;
    return <span data-probe={`progress-${id}`}>{progress[0]?.percent || 0}</span>;
}
function FilesProbe() {
    const files = useRemoteFiles('A');
    host.renderCounts['files-A'] += 1;
    return <span data-probe="files-A">{files.length}</span>;
}

function Fixture() {
    host.renderCounts.workspace += 1;
    const commands = useWorkspace();
    const { state, dispatch, setSessions } = commands;
    useEffect(() => {
        setSessions(
            ['A', 'B', 'C', 'D', 'E', 'F'].map((key) => ({
                key,
                label: key,
                isConnected: true,
                sessionConfPath: `/configs/${key}`,
                sessionConfId: key,
            })),
        );
    }, [setSessions]);
    // 实时读取诊断快照，测试不会依赖可变的全局运行时字典。
    host.workspace = {
        state,
        dispatch,
        get runtimes() {
            return sessionRegistry.debugSnapshot();
        },
    };
    return (
        <div style={{ display: 'flex', width: '100%', height: 760 }}>
            <aside style={{ flex: '0 0 120px', background: '#eee' }}>
                <div style={{ display: 'none' }}>
                    <ProgressProbe id="A" />
                    <ProgressProbe id="B" />
                    <FilesProbe />
                </div>
                <button
                    id="add-session"
                    onClick={() =>
                        setSessions((previous) => [
                            ...previous,
                            {
                                key: `added-${previous.length}`,
                                label: 'Added',
                                isConnected: true,
                                sessionConfPath: '/configs/added',
                            },
                        ])
                    }
                >
                    New session
                </button>
            </aside>
            <div style={{ flex: 1, minWidth: 0 }}>
                <SessionWorkspace
                    state={state}
                    dispatch={dispatch}
                    renderLabel={(session) => (
                        <span style={{ display: 'inline-block', padding: '8px 0 8px 16px' }}>
                            {session.label}
                        </span>
                    )}
                    onClose={(key) => sessionService.close([key], commands)}
                    onDetach={(key) => {
                        host.detaches.push(key);
                        const session = state.sessions.find((item) => item.key === key);
                        if (session) void sessionService.detach(session, commands);
                    }}
                    labels={{
                        maximize: 'Maximize',
                        restore: 'Restore',
                        resize: 'Resize',
                        tooSmall: 'Too small',
                        positions: {
                            tabs: 'Move',
                            center: 'Merge',
                            left: 'Left',
                            right: 'Right',
                            top: 'Above',
                            bottom: 'Below',
                        },
                    }}
                    renderSession={(session, visible, focused) => (
                        <TerminalView session={session} visible={visible} focused={focused} />
                    )}
                />
            </div>
        </div>
    );
}
ReactDOM.render(
    React.createElement(
        PromptProvider,
        null,
        <TransferProvider>
            <WorkspaceProvider>
                <Fixture />
            </WorkspaceProvider>
        </TransferProvider>,
    ),
    document.getElementById('root'),
);
