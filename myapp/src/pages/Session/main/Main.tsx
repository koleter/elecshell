import {Dropdown, Layout, Tabs, Modal, Input} from 'antd';
import type {DataNode} from 'antd/es/tree';
import React, {useState, useRef, useContext, useEffect} from 'react';
import "./Main.less"
import "xterm/css/xterm.css"
import SessionWindow from "@/pages/Session/Xterminal/sessionWindow";
import ScriptDrawer from "@/pages/Session/ScriptDrawer/ScriptDrawer";
import SessionList from "@/pages/Session/SessionList/SessionList";
import util, {showMessage} from "@/util";
import {AppContext, AppContextProvider} from "@/pages/context/AppContextProvider";
import {request} from "@@/plugin-request/request";
import DragLine from "@/pages/Session/components/dragline/DragLine";

let {ipcRenderer} = window.require('electron');

const {Content, Sider} = Layout;
type TargetKey = React.MouseEvent | React.KeyboardEvent | string;

// 记录sessionId对应的文件名,这个用来过滤session可用的脚本
export const sessionIdMapFileName = {};

// 记录sessionId对应的sock等信息
export const sessionIdRef = {};

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
  const [activeKey, setActiveKey] = useState('');
  const [sessions, setSessions] = useState([]);

  const [isMaximized, setIsMaximized] = useState(false);

  const onChange = (newActiveKey: string) => {
    setActiveKey(newActiveKey);
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

  const {setShowPrompt, promptOKCallback, promptUserInput} = context;

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
        promptInputRef
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
          width: '6px',
          height: '95%',
          zIndex: 999
        }} onMouseEnter={() => {
          // setDrawerOpen(true);
          sessions.length && setDrawerOpen(true);
        }}/>
        <Layout style={{display: 'flex', height: '100%', width: '100%'}}>
          <div id={"header"}
               style={{backgroundColor: '#D3E3FD', display: 'flex', justifyContent: 'flex-end', height: "28px"}}>
            <div className="window-control-box window-control-minimize" onClick={() => {
              ipcRenderer.send('window-min');
            }}>
              <span role="img" aria-label="minus" className="anticon anticon-minus iblock font12 widnow-control-icon">
                <svg viewBox="64 64 896 896" focusable="false" data-icon="minus" width="1em" height="1em"
                     fill="currentColor" aria-hidden="true">
                  <path
                    d="M872 474H152c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h720c4.4 0 8-3.6 8-8v-60c0-4.4-3.6-8-8-8z"></path>
                </svg>
              </span>
            </div>
            <div className="window-control-box window-control-maximize" onClick={() => {
              ipcRenderer.send('window-max');
              setIsMaximized(!isMaximized);
            }}>
              {
                isMaximized ?
                  <span className="iblock font12 icon-maximize widnow-control-icon is-max"></span> :
                  <span className="iblock font12 icon-maximize widnow-control-icon not-max"></span>
              }
            </div>

            <div className="window-control-box window-control-close" onClick={() => {
              ipcRenderer.send('window-close');
            }
            }>
              <span role="img" aria-label="close" className="anticon anticon-close iblock font12 widnow-control-icon">
                <svg viewBox="64 64 896 896" focusable="false" data-icon="close" width="1em" height="1em"
                     fill="currentColor" aria-hidden="true">
                  <path
                    d="M799.86 166.31c.02 0 .04.02.08.06l57.69 57.7c.04.03.05.05.06.08a.12.12 0 010 .06c0 .03-.02.05-.06.09L569.93 512l287.7 287.7c.04.04.05.06.06.09a.12.12 0 010 .07c0 .02-.02.04-.06.08l-57.7 57.69c-.03.04-.05.05-.07.06a.12.12 0 01-.07 0c-.03 0-.05-.02-.09-.06L512 569.93l-287.7 287.7c-.04.04-.06.05-.09.06a.12.12 0 01-.07 0c-.02 0-.04-.02-.08-.06l-57.69-57.7c-.04-.03-.05-.05-.06-.07a.12.12 0 010-.07c0-.03.02-.05.06-.09L454.07 512l-287.7-287.7c-.04-.04-.05-.06-.06-.09a.12.12 0 010-.07c0-.02.02-.04.06-.08l57.7-57.69c.03-.04.05-.05.07-.06a.12.12 0 01.07 0c.03 0 .05.02.09.06L512 454.07l287.7-287.7c.04-.04.06-.05.09-.06a.12.12 0 01.07 0z"></path>
                </svg>
              </span>
            </div>
          </div>
          <Layout hasSider style={{display: 'flex'}}>
            <Sider
              width={xshListWindowWidth}
              style={{height: "100vh", backgroundColor: 'white'}}>
              <SessionList
                sessions={sessions}
                setSessions={setSessions}
                setActiveKey={setActiveKey}
              />
            </Sider>
            <DragLine moveFunc={setXshListWindowWidth} moveEndFunc={(startX) => {
              request(util.baseUrl + 'conf', {
                method: 'POST',
                body: JSON.stringify({
                  type: 'GlobalAutoConfig',
                  args: {
                    xshListWindowWidth: startX
                  }
                })
              })
            }
            }/>

            <Content style={{width: '100%', overflow: 'hidden', display: "flex", flexDirection: 'column'}}>
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

                  return {
                    label: (
                      <Dropdown
                        menu={{
                          items: [
                            {
                              label: (
                                <span onClick={() => {
                                  var name = prompt("重命名");
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
                      sessions={sessions}
                      setSessions={setSessions}
                    />
                  }
                })}
                onEdit={onEdit}
                onChange={onChange}/>
            </Content>
          </Layout>
        </Layout>

        <ScriptDrawer
          activeKey={activeKey}
          sessions={sessions}
          drawerOpen={drawerOpen}
          setDrawerOpen={setDrawerOpen}
        />
      </div>
    }}

  </AppContext.Consumer>
};

export default SessionMain;
