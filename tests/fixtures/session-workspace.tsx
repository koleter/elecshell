import React, {useEffect, useRef} from 'react';
import ReactDOM from 'react-dom';
import SessionWorkspace from '../../src/pages/Session/components/SessionWorkspace/SessionWorkspace';
import useWorkspace from '../../src/pages/Session/components/SessionWorkspace/useWorkspace';
import SessionWindow from '../../src/pages/Session/SessionTab/Xterminal/sessionWindow';
import {getFocusedSession} from '../../src/pages/Session/components/SessionWorkspace/layout';
import {sessionConfInfo, sessionIdRef} from '../../src/pages/Session/sessionRuntime';
import {AppContext} from './workspaceContext';
import 'antd/dist/antd.css';

const host = window as any;
Object.assign(sessionConfInfo, {A: '/configs/A', B: '/configs/B', C: '/configs/C', D: '/configs/D', E: '/configs/E', F: '/configs/F'});
// 记录原生浮层与拖出窗口调用，供浏览器测试检查宿主交互而无需启动 Electron。
host.detaches = [];
host.nativeCalls = [];
host.electronAPI = {
    platform: 'linux',
    FS_appendFileSync: () => undefined,
    showDragOverlay: async (payload: unknown) => { host.nativeCalls.push(['show', payload]); },
    hideDragOverlay: async () => { host.nativeCalls.push(['hide']); },
};

function Fixture() {
    const {state, dispatch, setSessions} = useWorkspace();
    const promptModalCancelRef = useRef(null);
    useEffect(() => {
        setSessions(['A', 'B', 'C', 'D', 'E', 'F'].map(key => ({key, label: key, isConnected: true, sessionConfPath: `/configs/${key}`, sessionConfId: key})));
    }, []);
    // 暴露当前状态和实例引用，仅供测试断言布局变更前后的连接身份。
    host.workspace = {state, dispatch, runtimes: sessionIdRef};
    return <AppContext.Provider value={{
        activeKey: getFocusedSession(state), promptModalCancelRef,
        prompt: () => undefined, setSessionTransferTreeData: () => undefined, setFileProgressInfo: () => undefined,
    }}>
        <div style={{display: 'flex', width: '100%', height: 760}}>
            <aside style={{flex: '0 0 120px', background: '#eee'}}>
                <button id="add-session" onClick={() => setSessions(previous => [...previous, {
                    key: `added-${previous.length}`, label: 'Added', isConnected: true, sessionConfPath: '/configs/added',
                }])}>New session</button>
            </aside>
            <div style={{flex: 1, minWidth: 0}}>
                <SessionWorkspace state={state} dispatch={dispatch}
                    renderLabel={session => <span style={{display: 'inline-block', padding: '8px 0 8px 16px'}}>{session.label}</span>}
                    onClose={key => setSessions(previous => previous.filter(session => session.key !== key))}
                    onDetach={key => {
                        host.detaches.push(key);
                        sessionIdRef[key]?.send({type: 'detach'});
                        sessionIdRef[key]?.sock.close();
                        setSessions(previous => previous.filter(session => session.key !== key));
                    }}
                    labels={{empty: 'Open a session', maximize: 'Maximize', restore: 'Restore', resize: 'Resize', tooSmall: 'Too small',
                        positions: {tabs: 'Move', center: 'Merge', left: 'Left', right: 'Right', top: 'Above', bottom: 'Below'}}}
                    renderSession={(session, visible, focused) => <SessionWindow id={session.key}
                        sessionConfId={session.sessionConfId} setSessions={setSessions} isConnected={session.isConnected}
                        session={session} visible={visible} focused={focused}/>}/>
            </div>
        </div>
    </AppContext.Provider>;
}
ReactDOM.render(React.createElement(Fixture), document.getElementById('root'));
