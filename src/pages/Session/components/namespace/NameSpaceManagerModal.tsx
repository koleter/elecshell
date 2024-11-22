import {ProList} from '@ant-design/pro-components';
import React, {useContext, useEffect, useState} from 'react';
import util, {showMessage} from "@/util";
import {Button, Form, Input, message, Modal, Popconfirm} from 'antd';
import {FormattedMessage} from "@@/plugin-locale/localeExports";
import {AppContext} from "@/pages/context/AppContextProvider";

const NameSpaceManagerModal = () => {
    const [modalVisit, setModalVisit] = useState(false);
    const [nameSpaceList, setNameSpaceList] = useState([]);
    const [searchValue, setSearchValue] = useState("");
    const [curNameSpace, setCurNameSpace] = useState("");


    const {
        prompt, setRefreshConfigableGlobalConfig, setRefreshTreeData, setRefreshScriptData
    } = useContext(AppContext);

    useEffect(() => {
        util.request('conf', {
            method: 'GET',
            params: {
                type: 'nameSpaceConfig',
            },
        }).then(res => {
            // console.log(res)
            setCurNameSpace(res.data.namespace)
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
        setModalVisit(true);
    });

    return <>
        <Modal
            title="管理命名空间"
            width={800}
            open={modalVisit}
            footer={null}
            onCancel={() => {
                setModalVisit(false);
            }}
        >
            <ProList
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
                                            type: 'nameSpaceConfig',
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
                                切换
                            </a>,
                            <Popconfirm
                                title="Delete the task"
                                description="Are you sure to delete this task?"
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
                                // onCancel={cancel}
                                okText="Yes"
                                cancelText="No"
                            >
                                <a
                                    key="view"
                                >
                                    <FormattedMessage
                                        key="pages.session.delete"
                                        id="pages.session.delete"
                                        defaultMessage="删除"
                                    />
                                </a>
                            </Popconfirm>
                        ]
                        },
                    },
                }}
                toolBarRender={() => {
                    return [
                        <Form.Item
                            label={<FormattedMessage
                                key="loginWith"
                                id="pages.session.search"
                                defaultMessage="查询"
                            />}
                        >
                            <Input style={{float: 'left'}} onChange={(e) => {
                                const {value: inputValue} = e.target;
                                setSearchValue(inputValue);
                            }}/>
                        </Form.Item>
                        ,
                        <Form.Item>
                            <Button type={'primary'} onClick={() => {
                                prompt("请输入要新建的命名空间的名字", (input) => {
                                    if (!input) {
                                        message.error("命名空间不能为空");
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
                                新建命名空间
                            </Button>
                        </Form.Item>
                    ];
                }}
            />
        </Modal>
    </>
}

export default NameSpaceManagerModal;
