import {MenuProps, Space} from 'antd';
import {Dropdown, Input, Layout, Menu, Modal, Tabs} from 'antd';
import type {DataNode} from 'antd/es/tree';
import React, {useContext, useEffect, useRef, useState} from 'react';
import "./Main.less"
import "xterm/css/xterm.css"
import SessionWindow from "@/pages/Session/SessionTab/Xterminal/sessionWindow";
import ScriptDrawer from "@/pages/Session/ScriptDrawer/ScriptDrawer";
import SessionList from "@/pages/Session/SessionList/SessionList";
import util, {showMessage} from "@/util";
import {AppContext} from "@/pages/context/AppContextProvider";
import DragLine from "@/pages/Session/components/dragline/DragLine";
import FileTransfer from "@/pages/Session/fileTransfer/FileTransfer";

import {CodeOutlined, DesktopOutlined,} from '@ant-design/icons';
import {MENU_FILETRANSFER, NENU_SESSIONS} from "@/const";
import {FormattedMessage, useIntl} from "@@/plugin-locale/localeExports";
import {capitalizeFirstLetter} from "@/pages/util/string";
import DraggableTabs from "@/pages/Session/components/DraggableTabs/DraggableTabs";
import type {DragEndEvent} from "@dnd-kit/core";
import {arrayMove} from "@dnd-kit/sortable";
import SessionDraggableTabs from "@/pages/Session/components/SessionDraggableTabs/SessionDraggableTabs";

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

export const sessionInit = {};

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

const SessionMain: React.FC = () => {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [sessions, setSessions] = useState([]);
    const intl = useIntl();

    const {
        setShowPrompt,
        promptOKCallback,
        promptModalCancelRef,
        promptUserInput,
        prompt,
        promptInputRef,
        activeKey,
        setActiveKey,
        selectedMenuKey,
        setSelectedMenuKey
    } = useContext(AppContext);

    useEffect(() => {
        if (!activeKey) {
            window.electronAPI.ipcRenderer.send('update-title', "elecshell");
            return;
        }
        for (const session of sessions) {
            if (session.key === activeKey) {
                window.electronAPI.ipcRenderer.send('update-title', session.label);
                return;
            }
        }
    }, [activeKey]);

    useEffect(() => {
        const handleKeyUp = (e) => {
            if (e.keyCode === 81 && e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
                setDrawerOpen(true);
            }
        }
        document.addEventListener('keyup', handleKeyUp);

        return () => {
            document.removeEventListener('keyup', handleKeyUp);
        }
    }, []);

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
        if (!newPanes.length) {
            newActiveKey = "";
        }
        setActiveKey(newActiveKey);
    };

    const onEdit = (
        targetKey: React.MouseEvent | React.KeyboardEvent | string,
        action: 'add' | 'remove',
    ) => {
        removeTabByKey(targetKey);
    };

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
            return <div id={"Main"} style={{position: 'relative', height: '100%'}}>
                <Modal width={800}
                       title={promptTitle}
                       open={showPrompt}
                       maskClosable={false}
                       closable={false}
                       onOk={promptOk}
                       onCancel={() => {
                           setShowPrompt(false);
                           console.log("Modal onCancel");
                           promptModalCancelRef.current && promptModalCancelRef.current();
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

                <Layout id={"outerLayout"} style={{display: 'flex', height: '100%'}}>
                    <Layout id={"innerLayout"} hasSider style={{display: 'flex', height: '100%'}}>
                        <Menu
                            style={{width: '36px', flexShrink: 0}}
                            mode="inline"
                            inlineCollapsed={true}
                            onClick={function ({item, key, keyPath, domEvent}) {
                                // console.log(item, key, keyPath, domEvent);
                                setSelectedMenuKey(key);
                            }}
                            items={[
                                {key: NENU_SESSIONS, icon: <CodeOutlined/>, label: intl.formatMessage({id: NENU_SESSIONS})},
                                {key: MENU_FILETRANSFER, icon: <DesktopOutlined/>, label: intl.formatMessage({id: MENU_FILETRANSFER})},
                            ]}
                        />

                        <div style={{backgroundColor: 'white', flexShrink: 0, position: "relative", width: xshListWindowWidth, maxHeight: "100%", overflowY: 'auto', overflowX: 'hidden'}}>
                            <SessionList
                                setSessions={setSessions}
                                setActiveKey={setActiveKey}
                            />
                            <FileTransfer sessions={sessions}/>
                        </div>


                        <DragLine
                            startPos={xshListWindowWidth}
                            moveFunc={setXshListWindowWidth}
                            moveEndFunc={(endPos) => {
                                util.request('conf', {
                                    method: 'POST',
                                    body: JSON.stringify({
                                        type: 'GlobalAutoConfig',
                                        args: {
                                            xshListWindowWidth: endPos
                                        }
                                    })
                                })
                            }}
                            canMove={(e, endPos) => {
                                // 拖拽时，宽度不能减小到一定程度
                                if (e.movementX < 0 && endPos < 200) {
                                    return false;
                                }
                                return true;
                            }}
                        />


                        <Content style={{width: '100%', overflow: 'hidden'}}>
                            <SessionDraggableTabs
                                id={"sessionTabs"}
                                type="editable-card"
                                activeKey={activeKey}
                                style={{height: '100px'}}
                                hideAdd
                                onDragEnd={({ active, over }: DragEndEvent) => {
                                    if (active.id !== over?.id) {
                                        setSessions((prev) => {
                                            const activeIndex = prev.findIndex((i) => i.key === active.id);
                                            const overIndex = prev.findIndex((i) => i.key === over?.id);
                                            return arrayMove(prev, activeIndex, overIndex);
                                        });
                                    }
                                }}
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
                                                                <div onClick={() => {
                                                                    prompt(capitalizeFirstLetter(intl.formatMessage({id: "rename"})), (name) => {
                                                                        if (!name.trim()) {
                                                                            showMessage({
                                                                                status: "error",
                                                                                content: intl.formatMessage({id: "input can not be empty"})
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

                                                                }}>{capitalizeFirstLetter(intl.formatMessage({id: "rename"}))}</div>
                                                            ),
                                                            key: 'rename'
                                                        },
                                                        {
                                                            label: (
                                                                <>
                                                                    {item['logPath'] ? <div onClick={() => {
                                                                        setSessions(() => {
                                                                            const data = [...sessions];
                                                                            for (let i = 0; i < data.length; i++) {
                                                                                if (data[i].key === item.key) {
                                                                                    data[i].logPath = "";
                                                                                    return data;
                                                                                }
                                                                            }
                                                                            return data;
                                                                        });
                                                                    }}>
                                                                        <FormattedMessage id={'Close Logging'}></FormattedMessage>
                                                                    </div> : <div onClick={() => {
                                                                        window.electronAPI.ipcRenderer.send('save-file-dialog', item.key);
                                                                        window.electronAPI.ipcRenderer.on('selected-file', function (event, result, sessionId) {
                                                                            if (result.canceled) {
                                                                                return;
                                                                            }
                                                                            window.electronAPI.FS_writeFileSync(result.filePath, "");
                                                                            setSessions(() => {
                                                                                const data = [...sessions];
                                                                                for (let i = 0; i < data.length; i++) {
                                                                                    if (data[i].key === sessionId) {
                                                                                        data[i].logPath = result.filePath;
                                                                                        return data;
                                                                                    }
                                                                                }
                                                                                return data;
                                                                            });
                                                                        });
                                                                    }}>
                                                                        <FormattedMessage id={'Startup Logging'}></FormattedMessage>
                                                                    </div>
                                                                    }
                                                                </>
                                                            ),
                                                            key: 'log'
                                                        },
                                                        {
                                                            label: (
                                                                <div onClick={() => {
                                                                    setSessions(sessions.filter(session => session.key === item.key));
                                                                    closeSessions(sessions.filter(session => session.key !== item.key));
                                                                }}><FormattedMessage id={'Close other tabs'}></FormattedMessage></div>
                                                            ),
                                                            key: 'closeOtherTabs'
                                                        },
                                                        {
                                                            label: (
                                                                <div onClick={() => {
                                                                    closeSessions(sessions);
                                                                    setSessions([]);
                                                                }}><FormattedMessage id={'Close all tabs'}></FormattedMessage></div>
                                                            ),
                                                            key: 'closeAllTabs'
                                                        }
                                                    ]
                                                }} trigger={['contextMenu']}>
                  <span style={{display: 'inline-block', padding: '8px 0 8px 16px'}}>
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
                                            encoding={item.encoding}
                                            session={item}
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
