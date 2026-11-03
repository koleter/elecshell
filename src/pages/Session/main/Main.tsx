import React, {useContext, useEffect, useMemo, useState} from 'react';
import {Dropdown, Input, Layout, Menu, Modal} from 'antd';
import {CodeOutlined, DesktopOutlined} from '@ant-design/icons';
import {FormattedMessage, useIntl} from '@@/plugin-locale/localeExports';
import SessionWindow from '@/pages/Session/SessionTab/Xterminal/sessionWindow';
import ScriptDrawer from '@/pages/Session/ScriptDrawer/ScriptDrawer';
import SessionList from '@/pages/Session/SessionList/SessionList';
import DragLine from '@/pages/Session/components/dragline/DragLine';
import FileTransfer from '@/pages/Session/fileTransfer/FileTransfer';
import SessionWorkspace from '@/pages/Session/components/SessionWorkspace/SessionWorkspace';
import useWorkspace from '@/pages/Session/components/SessionWorkspace/useWorkspace';
import {getFocusedSession, getGroups} from '@/pages/Session/components/SessionWorkspace/layout';
import type {TerminalSession} from '@/pages/Session/components/SessionWorkspace/layout';
import {sessionIdMapFileName, sessionIdRef} from '@/pages/Session/sessionRuntime';
import {AppContext} from '@/pages/context/AppContextProvider';
import {capitalizeFirstLetter} from '@/pages/util/string';
import {MENU_FILETRANSFER, NENU_SESSIONS} from '@/const';
import util, {showMessage} from '@/util';
import './Main.less';

const {Content} = Layout;
const path = require('path');

const SessionMain: React.FC<{initialSession?: TerminalSession; initialContent?: string}> = props => {
    const {initialSession, initialContent} = props;
    const [drawerOpen, setDrawerOpen] = useState(false);
    const {state, dispatch, setSessions, activateSession} = useWorkspace(initialSession);
    const {sessions} = state;
    const activeKey = getFocusedSession(state);
    const activeLabel = sessions.find(session => session.key === activeKey)?.label || 'elecshell';
    // 一次建立会话到标签组的索引，渲染各标签菜单时无需反复遍历整个布局树。
    const tabsBySession = useMemo(() => {
        const groups = new Map<string, string[]>();
        getGroups(state.root).forEach(group => group.tabs.forEach(key => groups.set(key, group.tabs)));
        return groups;
    }, [state.root]);
    const intl = useIntl();
    const {
        setShowPrompt, promptOKCallback, promptModalCancelRef, promptUserInput, prompt,
        promptInputRef, setActiveKey, xshListWindowWidth, setXshListWindowWidth,
        showPrompt, promptTitle, setPromptUserInput, setSelectedMenuKey,
    } = useContext<any>(AppContext);

    // 将焦点分屏中的活动会话同步给原有全局上下文，脚本和文件传输仍能找到当前会话。
    useEffect(() => { setActiveKey(activeKey); }, [activeKey, setActiveKey]);

    useEffect(() => {
        if (initialSession?.sessionConfPath) {
            sessionIdMapFileName[initialSession.key] = path.basename(initialSession.sessionConfPath);
        }
    }, [initialSession?.key, initialSession?.sessionConfPath]);

    useEffect(() => {
        window.electronAPI.ipcRenderer.send('update-title', activeLabel);
    }, [activeLabel]);

    useEffect(() => {
        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code === 'KeyQ' && event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) setDrawerOpen(true);
        };
        document.addEventListener('keyup', handleKeyUp);
        return () => document.removeEventListener('keyup', handleKeyUp);
    }, []);

    // 日志文件选择事件按页面生命周期注册一次，避免重渲染后重复监听或操作旧会话数组。
    useEffect(() => {
        const handleSelectedFile = (_event: unknown, result: {canceled: boolean; filePath: string}, sessionId: string) => {
            if (result.canceled || !result.filePath) return;
            window.electronAPI.FS_writeFileSync(result.filePath, '');
            setSessions(previous => previous.map(session => session.key === sessionId ? {...session, logPath: result.filePath} : session));
        };
        const ipc = window.electronAPI.ipcRenderer;
        ipc.on('selected-file', handleSelectedFile);
        return () => ipc.removeListener('selected-file', handleSelectedFile);
    }, [setSessions]);

    // 主动关闭才结束连接；reducer 随后选择相邻标签并收起空分屏。
    const closeSessions = (keys: string[]) => {
        const removed = new Set(keys);
        keys.forEach(key => sessionIdRef[key]?.sock.close());
        setSessions(previous => previous.filter(session => !removed.has(session.key)));
    };

    const serializeTerminal = (term: any): string => {
        if (!term) return '';
        try {
            if (term._serializeAddon) return term._serializeAddon.serialize();
        } catch (error) {
            console.error('serialize term failed', error);
        }
        // 优先保留 ANSI 状态；序列化插件不可用时至少保留缓冲区中的文本。
        const lines: string[] = [];
        for (let index = 0; index < term.buffer.active.length; index++) {
            const line = term.buffer.active.getLine(index);
            if (line) lines.push(line.translateToString(true));
        }
        return lines.join('\n');
    };

    const handleDetach = async (sessionKey: string) => {
        const item = sessions.find(session => session.key === sessionKey);
        const runtime = sessionIdRef[sessionKey];
        if (!item?.isConnected || !runtime) return;
        const content = serializeTerminal(runtime.term);
        try {
            // detach 先通知后端保留 SSH worker，再关闭当前 WebSocket。
            // 新窗口复用会话 ID 重新接入，并用序列化内容恢复显示；窗口内分屏不会走此流程。
            runtime.send({type: 'detach'});
            runtime.sock.close();
            setSessions(previous => previous.filter(session => session.key !== sessionKey));
            await window.electronAPI.ipcRenderer.invoke('create-detached-window', {
                sessionId: sessionKey, session: {...item}, initialContent: content,
            });
        } catch (error) {
            console.error('create detached window failed', error);
            showMessage({status: 'error', content: String(error)});
        }
    };

    const renderLabel = (item: TerminalSession) => {
        // 右键批量关闭仅作用于当前标签组，避免影响其他分屏的会话。
        const groupTabs = tabsBySession.get(item.key) || [];
        return <Dropdown trigger={['contextMenu']} menu={{items: [
            {
                key: 'rename',
                label: <div onClick={() => prompt(capitalizeFirstLetter(intl.formatMessage({id: 'rename'})), (name: string) => {
                    if (!name.trim()) {
                        showMessage({status: 'error', content: intl.formatMessage({id: 'input can not be empty'})});
                        return;
                    }
                    setSessions(previous => previous.map(session => session.key === item.key ? {...session, label: name} : session));
                })}>{capitalizeFirstLetter(intl.formatMessage({id: 'rename'}))}</div>,
            },
            {
                key: 'log',
                label: item.logPath
                    ? <div onClick={() => setSessions(previous => previous.map(session => session.key === item.key ? {...session, logPath: ''} : session))}>
                        <FormattedMessage id="Close Logging"/>
                    </div>
                    : <div onClick={() => window.electronAPI.ipcRenderer.send('save-file-dialog', item.key)}>
                        <FormattedMessage id="Startup Logging"/>
                    </div>,
            },
            {
                key: 'closeOtherTabs',
                label: <div onClick={() => closeSessions(groupTabs.filter(key => key !== item.key))}><FormattedMessage id="Close other tabs"/></div>,
            },
            {
                key: 'closeAllTabs',
                label: <div onClick={() => closeSessions(groupTabs)}><FormattedMessage id="Close all tabs"/></div>,
            },
        ]}}>
            <span style={{display: 'inline-block', padding: '8px 0 8px 16px'}}>
                {item.label}<span className={`session-tab-status${item.isConnected ? ' session-tab-status--connected' : ''}`}/>
            </span>
        </Dropdown>;
    };

    const promptOk = () => {
        setShowPrompt(false);
        if (promptOKCallback) promptOKCallback(promptUserInput);
    };
    const label = (id: string) => intl.formatMessage({id});

    return <div id="Main" style={{position: 'relative', height: '100%'}}>
        <Modal width={800} title={promptTitle} open={showPrompt} maskClosable={false} closable={false}
            onOk={promptOk} onCancel={() => {
                setShowPrompt(false);
                promptModalCancelRef.current?.();
            }}>
            <Input ref={promptInputRef} allowClear value={promptUserInput}
                onKeyDown={event => { if (event.key === 'Enter') promptOk(); }}
                onChange={event => setPromptUserInput(event.target.value)}/>
        </Modal>
        <Layout id="outerLayout" style={{display: 'flex', height: '100%'}}>
            <Layout id="innerLayout" hasSider style={{display: 'flex', height: '100%'}}>
                <Menu style={{width: 36, flexShrink: 0}} mode="inline" inlineCollapsed
                    onClick={({key}) => setSelectedMenuKey(key)}
                    items={[
                        {key: NENU_SESSIONS, icon: <CodeOutlined/>, label: label(NENU_SESSIONS)},
                        {key: MENU_FILETRANSFER, icon: <DesktopOutlined/>, label: label(MENU_FILETRANSFER)},
                    ]}/>
                <div style={{backgroundColor: 'white', flexShrink: 0, position: 'relative', width: xshListWindowWidth, maxHeight: '100%', overflowY: 'auto', overflowX: 'hidden'}}>
                    <SessionList setSessions={setSessions} setActiveKey={activateSession}/>
                    <FileTransfer sessions={sessions}/>
                </div>
                <DragLine startPos={xshListWindowWidth} moveFunc={setXshListWindowWidth}
                    moveEndFunc={(endPos: number) => util.request('conf', {
                        method: 'POST',
                        body: JSON.stringify({type: 'GlobalAutoConfig', args: {xshListWindowWidth: endPos}}),
                    })}
                    canMove={(event: MouseEvent, endPos: number) => !(event.movementX < 0 && endPos < 200)}/>
                <Content style={{width: '100%', minWidth: 0, overflow: 'hidden'}}>
                    <SessionWorkspace state={state} dispatch={dispatch} renderLabel={renderLabel}
                        onClose={key => closeSessions([key])} onDetach={handleDetach}
                        labels={{
                            resize: label('terminal.resize'), tooSmall: label('terminal.tooSmall'),
                            positions: {
                                tabs: label('terminal.drop.tabs'), center: label('terminal.drop.center'),
                                left: label('terminal.drop.left'), right: label('terminal.drop.right'),
                                top: label('terminal.drop.top'), bottom: label('terminal.drop.bottom'),
                            },
                        }}
                        renderSession={(session, visible, focused) => <SessionWindow
                            id={session.key} sessionConfId={session.sessionConfId} setSessions={setSessions}
                            isConnected={session.isConnected} encoding={session.encoding} session={session}
                            visible={visible} focused={focused}
                            initialContent={session.key === initialSession?.key ? initialContent : undefined}
                        />}/>
                </Content>
            </Layout>
        </Layout>
        <ScriptDrawer activeKey={activeKey} drawerOpen={drawerOpen} setDrawerOpen={setDrawerOpen}/>
    </div>;
};

export default SessionMain;
