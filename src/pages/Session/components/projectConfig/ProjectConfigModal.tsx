import {ProList} from '@ant-design/pro-components';
import React, {useContext, useEffect, useRef, useState} from 'react';
import util, {showMessage} from "@/util";
import {Button, Form, Input, message, Modal, Popconfirm, Radio, Tabs} from 'antd';
import {FormattedMessage, setLocale} from "@@/plugin-locale/localeExports";
import {AppContext} from "@/pages/context/AppContextProvider";
import {capitalizeFirstLetter} from "@/pages/util/string";
import {useIntl} from '@@/plugin-locale/localeExports';

const ProjectConfigModal = () => {
    const [modalVisit, setModalVisit] = useState(false);
    const [nameSpaceList, setNameSpaceList] = useState([]);
    const [searchValue, setSearchValue] = useState("");
    const intl = useIntl();
    const oldLanguage = useRef("");
    const [language, setLanguage] = useState("en-US");
    const [curNameSpace, setCurNameSpace] = useState("");

    const {
        prompt,
        setRefreshConfigableGlobalConfig,
        setRefreshTreeData,
        setRefreshScriptData
    } = useContext(AppContext);

    electronAPI.ipcRenderer.on('switchLanguage', (event, language) => {
        setLocale(language, false);
        setLanguage(language);
    });

    useEffect(() => {
        util.request('conf', {
            method: 'GET',
            params: {
                type: 'ProjectConfig',
            },
        }).then(res => {
            console.log(res);
            setCurNameSpace(res.data.namespace);
            setLanguage(res?.data?.language || "en-US");
            setLocale(res?.data?.language || "en-US", false);
        });
        loadAllNameSpace()
    }, [])

    function loadAllNameSpace() {
        util.request('namespace', {
            method: 'GET',
        }).then(res => {
            setNameSpaceList(res);
        })
    }

    electronAPI.ipcRenderer.on('openManagerNameSpaceModal', (event, arg) => {
        oldLanguage.current = language;
        setModalVisit(true);
    });

    return <>
        <Modal
            title={capitalizeFirstLetter(intl.formatMessage({id: "globalConfig"}))}
            width={950}
            open={modalVisit}
            footer={null}
            onCancel={() => {
                if (oldLanguage.current !== language) {
                    util.request('conf', {
                        method: 'POST',
                        body: JSON.stringify({
                            type: 'ProjectConfig',
                            args: {
                                language
                            }
                        }),
                    });
                }
                setModalVisit(false);
            }}
        >
            <Tabs style={{
                height: "60vh"
            }}
                  tabBarGutter={4}
                  tabPosition={'left'}
                  items={[{
                      key: 'namespace',
                      label: capitalizeFirstLetter(intl.formatMessage({id: "namespace"})),
                      children: <ProList
                          dataSource={nameSpaceList.filter(namespace => {
                              return namespace.indexOf(searchValue) > -1;
                          })}
                          metas={{
                              valueType: 'text',
                              title: {
                                  render: (text, row) => {
                                      if (curNameSpace === row) {
                                          return <><span style={{color: 'red'}}>*</span>{row}</>;
                                      }
                                      return <span>{row}</span>;
                                  }
                              },
                              actions: {
                                  render: (text, namespace) => {
                                      if (curNameSpace === namespace) {
                                          return [];
                                      }
                                      return [
                                          <a
                                              key="link"
                                              onClick={() => {
                                                  util.request('conf', {
                                                      method: 'POST',
                                                      body: JSON.stringify({
                                                          type: 'ProjectConfig',
                                                          args: {
                                                              "namespace": namespace
                                                          }
                                                      }),
                                                  }).then(res => {
                                                      setCurNameSpace(namespace);
                                                      showMessage(res);
                                                      // reload xsh, script, global config
                                                      setRefreshTreeData(n => n + 1);
                                                      setRefreshScriptData(n => n + 1);
                                                      setRefreshConfigableGlobalConfig(n => n + 1);
                                                  });
                                              }}
                                          >
                                              <FormattedMessage id={'switch'}></FormattedMessage>
                                          </a>,
                                          <Popconfirm
                                              title={intl.formatMessage({id: 'Are you sure you want to delete?'})}
                                              onConfirm={() => {
                                                  util.request('namespace', {
                                                      method: 'DELETE',
                                                      body: JSON.stringify({
                                                          namespace: namespace
                                                      })
                                                  }).then((res) => {
                                                      loadAllNameSpace();
                                                      showMessage(res)
                                                  })
                                              }}
                                          >
                                              <a
                                                  key="view"
                                              >
                                                  <FormattedMessage id="delete"/>
                                              </a>
                                          </Popconfirm>
                                      ]
                                  },
                              },
                          }}
                          toolBarRender={() => {
                              return [
                                  <Form.Item
                                      label={capitalizeFirstLetter(intl.formatMessage({id: "search"}))}
                                  >
                                      <Input style={{float: 'left'}} onChange={(e) => {
                                          const {value: inputValue} = e.target;
                                          setSearchValue(inputValue);
                                      }}/>
                                  </Form.Item>
                                  ,
                                  <Form.Item>
                                      <Button type={'primary'} onClick={() => {
                                          let msg = intl.formatMessage({id: "ProjectConfigModal.namespace.create.prompt"});
                                          prompt(msg, (input) => {
                                              if (!input) {
                                                  msg = intl.formatMessage({id: 'namespace cannot be empty'});
                                                  message.error(msg);
                                                  return;
                                              }
                                              util.request('namespace', {
                                                  method: 'POST',
                                                  body: JSON.stringify({
                                                      namespace: input
                                                  })
                                              }).then((res) => {
                                                  loadAllNameSpace();
                                                  showMessage(res);
                                              })
                                          })
                                      }}>
                                          {capitalizeFirstLetter(intl.formatMessage({id: "create"}))}
                                      </Button>
                                  </Form.Item>
                              ];
                          }}
                      />
                  }, {
                      key: 'language',
                      label: capitalizeFirstLetter(intl.formatMessage({id: "language"})),
                      children: <>
                          <FormattedMessage id={'language'}/>: <Radio.Group onChange={(e) => {
                          electronAPI.ipcRenderer.send('switchLanguage', e.target.value);
                      }} value={language}>
                          <Radio value={"en-US"}>English</Radio>
                          <Radio value={"zh-CN"}>简体中文</Radio>
                      </Radio.Group>
                      </>
                  }]}
            />
        </Modal>
    </>
}

export default ProjectConfigModal;
