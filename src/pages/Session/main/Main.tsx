import React, { useEffect, useMemo, useState } from 'react';
import { Dropdown, Layout, Menu } from 'antd';
import { CodeOutlined, DesktopOutlined } from '@ant-design/icons';
import { FormattedMessage, useIntl } from '@@/plugin-locale/localeExports';
import TerminalView from '@/features/terminal/components/TerminalView';
import ScriptDrawer from '@/features/scripts/components/ScriptDrawer';
import SessionCatalog from '@/features/catalog/components/SessionCatalog';
import DragLine from '@/shared/components/DragLine';
import FileTransfer from '@/features/transfers/components/FileTransfer';
import SessionWorkspace from '@/features/workspace/components/SessionWorkspace';
import {
    WorkspaceProvider,
    useWorkspace,
    useWorkspaceCommands,
} from '@/features/workspace/model/WorkspaceProvider';
import { useShell } from '@/features/settings/model/ShellProvider';
import { usePrompt } from '@/features/dialogs/PromptProvider';
import { sessionService } from '@/features/sessions/services/sessionService';
import { sessionRegistry } from '@/features/sessions/model/sessionRegistry';
import { desktop } from '@/platform/electronBridge';
import { getGroups } from '@/features/workspace/model/layout';
import type { TerminalSession } from '@/features/sessions/model/types';
import { capitalizeFirstLetter } from '@/shared/string';
import { MENU_FILETRANSFER, NENU_SESSIONS } from '@/const';
import { showMessage } from '@/util';
import './Main.less';

const { Content } = Layout;

const SessionMainContent: React.FC<{
    initialSession?: TerminalSession;
    initialContent?: string;
}> = (props) => {
    const { initialSession, initialContent } = props;
    const [drawerOpen, setDrawerOpen] = useState(false);
    const { state, dispatch, setSessions, activeKey } = useWorkspace();
    const { sessions } = state;
    const activeLabel = sessions.find((session) => session.key === activeKey)?.label || 'elecshell';
    // 一次建立会话到标签组的索引，渲染各标签菜单时无需反复遍历整个布局树。
    const tabsBySession = useMemo(() => {
        const groups = new Map<string, string[]>();
        getGroups(state.root).forEach((group) =>
            group.tabs.forEach((key) => groups.set(key, group.tabs)),
        );
        return groups;
    }, [state.root]);
    const intl = useIntl();
    const { xshListWindowWidth, setXshListWindowWidth, setSelectedMenuKey, saveSidebarWidth } =
        useShell();
    const prompt = usePrompt();
    const commands = useWorkspaceCommands();
    useEffect(() => {
        if (initialSession) sessionRegistry.remember(initialSession);
    }, [initialSession]);

    useEffect(() => {
        desktop.setTitle(activeLabel);
    }, [activeLabel]);

    useEffect(() => {
        const handleKeyUp = (event: KeyboardEvent) => {
            if (
                event.code === 'KeyQ' &&
                event.ctrlKey &&
                !event.altKey &&
                !event.shiftKey &&
                !event.metaKey
            )
                setDrawerOpen(true);
        };
        document.addEventListener('keyup', handleKeyUp);
        return () => document.removeEventListener('keyup', handleKeyUp);
    }, []);

    // 日志文件选择事件按页面生命周期注册一次，避免重渲染后重复监听或操作旧会话数组。
    useEffect(() => {
        const handleSelectedFile = (
            _event: unknown,
            result: { canceled: boolean; filePath: string },
            sessionId: string,
        ) => {
            if (result.canceled || !result.filePath) return;
            desktop.writeFile(result.filePath, '');
            setSessions((previous) =>
                previous.map((session) =>
                    session.key === sessionId ? { ...session, logPath: result.filePath } : session,
                ),
            );
        };
        return desktop.on('selected-file', handleSelectedFile);
    }, [setSessions]);

    const closeSessions = (keys: string[]) => sessionService.close(keys, commands);
    const handleDetach = async (sessionKey: string) => {
        const session = sessions.find((item) => item.key === sessionKey);
        if (!session) return;
        try {
            await sessionService.detach(session, commands);
        } catch (error) {
            showMessage({ status: 'error', content: String(error) });
        }
    };

    const renderLabel = (item: TerminalSession) => {
        // 右键批量关闭仅作用于当前标签组，避免影响其他分屏的会话。
        const groupTabs = tabsBySession.get(item.key) || [];
        return (
            <Dropdown
                trigger={['contextMenu']}
                menu={{
                    items: [
                        {
                            key: 'rename',
                            label: (
                                <div
                                    onClick={() =>
                                        prompt(
                                            capitalizeFirstLetter(
                                                intl.formatMessage({ id: 'rename' }),
                                            ),
                                            (name: string) => {
                                                if (!name.trim()) {
                                                    showMessage({
                                                        status: 'error',
                                                        content: intl.formatMessage({
                                                            id: 'input can not be empty',
                                                        }),
                                                    });
                                                    return;
                                                }
                                                setSessions((previous) =>
                                                    previous.map((session) =>
                                                        session.key === item.key
                                                            ? { ...session, label: name }
                                                            : session,
                                                    ),
                                                );
                                            },
                                        )
                                    }
                                >
                                    {capitalizeFirstLetter(intl.formatMessage({ id: 'rename' }))}
                                </div>
                            ),
                        },
                        {
                            key: 'log',
                            label: item.logPath ? (
                                <div
                                    onClick={() =>
                                        setSessions((previous) =>
                                            previous.map((session) =>
                                                session.key === item.key
                                                    ? { ...session, logPath: '' }
                                                    : session,
                                            ),
                                        )
                                    }
                                >
                                    <FormattedMessage id="Close Logging" />
                                </div>
                            ) : (
                                <div onClick={() => desktop.selectLogFile(item.key)}>
                                    <FormattedMessage id="Startup Logging" />
                                </div>
                            ),
                        },
                        {
                            key: 'closeOtherTabs',
                            label: (
                                <div
                                    onClick={() =>
                                        closeSessions(groupTabs.filter((key) => key !== item.key))
                                    }
                                >
                                    <FormattedMessage id="Close other tabs" />
                                </div>
                            ),
                        },
                        {
                            key: 'closeAllTabs',
                            label: (
                                <div onClick={() => closeSessions(groupTabs)}>
                                    <FormattedMessage id="Close all tabs" />
                                </div>
                            ),
                        },
                    ],
                }}
            >
                <span style={{ display: 'inline-block', padding: '8px 0 8px 16px' }}>
                    {item.label}
                    <span
                        className={`session-tab-status${
                            item.isConnected ? ' session-tab-status--connected' : ''
                        }`}
                    />
                </span>
            </Dropdown>
        );
    };

    const label = (id: string) => intl.formatMessage({ id });

    return (
        <div id="Main" style={{ position: 'relative', height: '100%' }}>
            <Layout id="outerLayout" style={{ display: 'flex', height: '100%' }}>
                <Layout id="innerLayout" hasSider style={{ display: 'flex', height: '100%' }}>
                    <Menu
                        style={{ width: 36, flexShrink: 0 }}
                        mode="inline"
                        inlineCollapsed
                        onClick={({ key }) => setSelectedMenuKey(key)}
                        items={[
                            {
                                key: NENU_SESSIONS,
                                icon: <CodeOutlined />,
                                label: label(NENU_SESSIONS),
                            },
                            {
                                key: MENU_FILETRANSFER,
                                icon: <DesktopOutlined />,
                                label: label(MENU_FILETRANSFER),
                            },
                        ]}
                    />
                    <div
                        style={{
                            backgroundColor: 'white',
                            flexShrink: 0,
                            position: 'relative',
                            width: xshListWindowWidth,
                            maxHeight: '100%',
                            overflowY: 'auto',
                            overflowX: 'hidden',
                        }}
                    >
                        <SessionCatalog />
                        <FileTransfer />
                    </div>
                    <DragLine
                        startPos={xshListWindowWidth}
                        moveFunc={setXshListWindowWidth}
                        moveEndFunc={saveSidebarWidth}
                        canMove={(event: MouseEvent, endPos: number) =>
                            !(event.movementX < 0 && endPos < 200)
                        }
                    />
                    <Content style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
                        <SessionWorkspace
                            state={state}
                            dispatch={dispatch}
                            renderLabel={renderLabel}
                            onClose={(key) => closeSessions([key])}
                            onDetach={handleDetach}
                            labels={{
                                maximize: label('terminal.maximize'),
                                restore: label('terminal.restore'),
                                resize: label('terminal.resize'),
                                tooSmall: label('terminal.tooSmall'),
                                positions: {
                                    tabs: label('terminal.drop.tabs'),
                                    center: label('terminal.drop.center'),
                                    left: label('terminal.drop.left'),
                                    right: label('terminal.drop.right'),
                                    top: label('terminal.drop.top'),
                                    bottom: label('terminal.drop.bottom'),
                                },
                            }}
                            renderSession={(session, visible, focused) => (
                                <TerminalView
                                    session={session}
                                    visible={visible}
                                    focused={focused}
                                    initialContent={
                                        session.key === initialSession?.key
                                            ? initialContent
                                            : undefined
                                    }
                                />
                            )}
                        />
                    </Content>
                </Layout>
            </Layout>
            <ScriptDrawer drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen} />
        </div>
    );
};

const SessionMain: React.FC<{ initialSession?: TerminalSession; initialContent?: string }> = (
    props,
) => (
    <WorkspaceProvider initialSession={props.initialSession}>
        <SessionMainContent {...props} />
    </WorkspaceProvider>
);

export default SessionMain;
