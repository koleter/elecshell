import {Dropdown, Layout, Tabs, Modal, Input, Menu} from 'antd';
import type {DataNode} from 'antd/es/tree';
import React, {useState, useRef, useContext, useEffect} from 'react';
import "./Main.less"
import "xterm/css/xterm.css"
import SessionWindow from "@/pages/Session/SessionTab/Xterminal/sessionWindow";
import ScriptDrawer from "@/pages/Session/ScriptDrawer/ScriptDrawer";
import SessionList from "@/pages/Session/SessionList/SessionList";
import util, {showMessage} from "@/util";
import {AppContext, AppContextProvider} from "@/pages/context/AppContextProvider";
import {request} from "@@/plugin-request/request";
import DragLine from "@/pages/Session/components/dragline/DragLine";
import FileTransfer from "@/pages/Session/fileTransfer/FileTransfer";

import {
    CodeOutlined,
    DesktopOutlined,
} from '@ant-design/icons';

const {Content, Sider} = Layout;
type TargetKey = React.MouseEvent | React.KeyboardEvent | string;

// 记录sessionId对应的文件名,这个用来过滤session可用的脚本
/*
id: sessionConfId,
filePath: sessionConfPath
*/
export const sessionIdMapFileName = {};

// 记录sessionId对应的sock等信息
export const sessionIdRef = {};

import type {MenuProps} from 'antd';

type MenuItem = Required<MenuProps>['items'][number];

let hoverTimeout;

const loop = (
    data: DataNode[],
    key: React.Key,
    callback: (node, i: number, data) => void,
) => {
    for (let i = 0; i < data.length; i++) {
        if (data[i].key === key) {
            return callback(data[i], i, data);
        }
        if (data[i].children) {
            if (loop(data[i].children!, key, callback)) {
                return true;
            }
        }
    }
};

const NENU_SESSIONS = "sessions";
const MENU_FILETRANSFER = "fileTransfer";

const SessionMain: React.FC = () => {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [sessions, setSessions] = useState([]);

    const [selectedMenuKey, setSelectedMenuKey] = useState(NENU_SESSIONS);

    const onChange = (newActiveKey: string) => {
        setActiveKey(newActiveKey);
        setTimeout(() => {
            sessionIdRef[newActiveKey]?.term?._fitAddon.fit();
        }, 50);
    };

    const removeTabByKey = (targetKey: TargetKey) => {
        try {
            sessionIdRef[targetKey].sock.close();
        } catch (e) {
            console.error(e);
        }

        let newActiveKey = activeKey;
        let lastIndex = -1;
        const data = [...sessions];
        data.forEach((item, i) => {
            if (item.key === targetKey) {
                lastIndex = i - 1;
            }
        });
        const newPanes = data.filter((item) => item.key !== targetKey);
        if (newPanes.length && newActiveKey === targetKey) {
            if (lastIndex >= 0) {
                newActiveKey = newPanes[lastIndex].key;
            } else {
                newActiveKey = newPanes[0].key;
            }
        }
        setSessions(newPanes);
        delete sessionIdRef[targetKey];
        setActiveKey(newActiveKey);
    };

    const onEdit = (
        targetKey: React.MouseEvent | React.KeyboardEvent | string,
        action: 'add' | 'remove',
    ) => {
        removeTabByKey(targetKey);
    };

    const context = useContext(AppContext);

    const {setShowPrompt, promptOKCallback, promptUserInput, prompt, promptInputRef, activeKey, setActiveKey} = context;

    const promptOk = () => {
        setShowPrompt(false);
        promptOKCallback && promptOKCallback(promptUserInput);
    }

    return <AppContext.Consumer>
        {({
              xshListWindowWidth,
              setXshListWindowWidth,
              showPrompt,
              promptTitle,
              setPromptUserInput,
          }) => {
            return <div style={{height: '100%'}}>
                <Modal width={800}
                       title={promptTitle}
                       open={showPrompt}
                       maskClosable={false}
                       closable={false}
                       onOk={promptOk}
                       onCancel={() => {
                           setShowPrompt(false);
                       }}>
                    <Input ref={promptInputRef}
                           allowClear={true}
                           onKeyDown={(e) => {
                               if (e.key == "Enter") {
                                   promptOk();
                               }
                           }}
                           onChange={(e) => {
                               setPromptUserInput(e.target.value);
                           }} value={promptUserInput}/>
                </Modal>

                <div style={{
                    position: 'absolute',
                    right: '0',
                    bottom: 0,
                    width: '20px',
                    height: '95%',
                    zIndex: 999
                }} onMouseEnter={() => {
                    hoverTimeout = setTimeout(() => {
                        if (process.env.NODE_ENV === 'development') {
                            setDrawerOpen(true);
                        } else {
                            sessions.length && setDrawerOpen(true);
                            // setDrawerOpen(true);
                        }
                    }, 100);
                }} onMouseLeave={() => {
                    clearTimeout(hoverTimeout);
                }}/>
                <Layout style={{display: 'flex', height: '100%', width: '100%'}}>
                    <Layout hasSider style={{display: 'flex'}}>
                        <Menu
                            style={{width: '36px'}}
                            mode="inline"
                            inlineCollapsed={true}
                            onClick={function ({item, key, keyPath, domEvent}) {
                                // console.log(item, key, keyPath, domEvent);
                                setSelectedMenuKey(key);
                            }}
                            items={[
                                {key: NENU_SESSIONS, icon: <CodeOutlined />, label: NENU_SESSIONS},
                                {key: MENU_FILETRANSFER, icon: <DesktopOutlined/>, label: MENU_FILETRANSFER},
                            ]}
                        />

                        <div
                            style={{width: xshListWindowWidth, height: "100vh", backgroundColor: 'white'}}>
                            {selectedMenuKey == NENU_SESSIONS ?
                                <SessionList
                                    setSessions={setSessions}
                                    setActiveKey={setActiveKey}
                                /> : <FileTransfer
                                    sessions={sessions}
                                />
                            }
                        </div>


                        <DragLine
                            startPos={xshListWindowWidth}
                            moveFunc={setXshListWindowWidth}
                            moveEndFunc={(startX) => {
                                request(util.baseUrl + 'conf', {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        type: 'GlobalAutoConfig',
                                        args: {
                                            xshListWindowWidth: startX
                                        }
                                    })
                                })
                            }}
                            canMove={(e, end) => {
                                // 拖拽时，宽度不能减小到一定程度
                                if (e.movementX < 0 && end < 200) {
                                    return false;
                                }
                                return true;
                            }}
                        />


                        <Content style={{width: '100%', overflow: 'hidden'}}>
                            <Tabs
                                id={"sessionTabs"}
                                type="editable-card"
                                activeKey={activeKey}
                                style={{height: '100px'}}
                                hideAdd
                                items={sessions.map(item => {
                                    function closeSessions(sessions) {
                                        sessions.forEach(session => {
                                            try {
                                                // 必须要调用websocket的close方法,直接设置session会导致页面上的会话关闭但是ssh连接未断开
                                                sessionIdRef[session.key].sock.close();
                                            } catch (e) {
                                                console.error(e);
                                            }
                                        })
                                    }

                                    // @ts-ignore
                                    return {
                                        label: (
                                            <Dropdown
                                                menu={{
                                                    items: [
                                                        {
                                                            label: (
                                                                <span onClick={() => {
                                                                    prompt("重命名", (name) => {
                                                                        if (!name.trim()) {
                                                                            showMessage({
                                                                                status: "error",
                                                                                content: "name can not be empty"
                                                                            });
                                                                            return;
                                                                        }
                                                                        setSessions((sessions) => {
                                                                            const data = [...sessions];
                                                                            for (const session of data) {
                                                                                if (session.key === item.key) {
                                                                                    session.label = name;
                                                                                    break;
                                                                                }
                                                                            }
                                                                            return data;
                                                                        });
                                                                    });

                                                                }}>重命名</span>
                                                            ),
                                                            key: 'rename'
                                                        },
                                                        {
                                                            label: (
                                                                <span onClick={() => {
                                                                    setSessions(sessions.filter(session => session.key === item.key));
                                                                    closeSessions(sessions.filter(session => session.key !== item.key));
                                                                }}>关闭其他选项卡</span>
                                                            ),
                                                            key: 'closeOtherTabs'
                                                        },
                                                        {
                                                            label: (
                                                                <span onClick={() => {
                                                                    closeSessions(sessions);
                                                                    setSessions([]);
                                                                }}>关闭所有选项卡</span>
                                                            ),
                                                            key: 'closeAllTabs'
                                                        }
                                                    ]
                                                }} trigger={['contextMenu']}>
                  <span>
                    {item.label}
                      <div style={{
                          display: 'inline-block',
                          backgroundColor: item.isConnected ? 'green' : 'red',
                          borderRadius: '50%',
                          width: '1em',
                          height: '1em'
                      }}></div>
                  </span>
                                            </Dropdown>

                                        ),
                                        key: item.key,
                                        forceRender: true,
                                        children: <SessionWindow
                                            key={item.key}
                                            id={item.key}
                                            setSessions={setSessions}
                                            isConnected={item.isConnected}
                                        />
                                    }
                                })}
                                onEdit={onEdit}
                                onChange={onChange}
                            />
                        </Content>
                    </Layout>
                </Layout>

                <ScriptDrawer
                    activeKey={activeKey}
                    drawerOpen={drawerOpen}
                    setDrawerOpen={setDrawerOpen}
                />
            </div>
        }}

    </AppContext.Consumer>
};

export default SessionMain;
