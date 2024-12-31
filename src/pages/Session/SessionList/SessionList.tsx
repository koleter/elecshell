import React, {useContext, useEffect, useRef, useState} from "react";
import {Dropdown, Form, Input, message, Modal, Tabs, Tree, Button, Menu} from "antd";
import {
    EditableProTable
} from '@ant-design/pro-components';
import UploadInFormItem from "../components/upload/Upload"
import {DataNode, TreeProps} from "antd/es/tree";
import {request} from "@@/plugin-request/request";
import util, {defineValidatorWithErrMessage, getUUid} from "@/util";
import {sessionIdMapFileName} from "@/pages/Session/main/Main";
import {AppContext} from "@/pages/context/AppContextProvider";
import "./SessionList.less"
import {NENU_SESSIONS} from "@/const";
import {fileSep} from "@/pages/util/path";
import {FormattedMessage, useIntl} from "@@/plugin-locale/localeExports";
import {capitalizeFirstLetter} from "@/pages/util/string";

const path = require('path');

const {DirectoryTree} = Tree;
const defaultSessionPropertyActiveKey = 'baseInfo';

// 记录session配置文件信息,conf_id -> conf_path
export let sessionConfInfo = {};

const SessionList: React.FC = (props) => {
    const {setSessions, setActiveKey} = props;

    const [form] = Form.useForm();
    const [modalNode, setModalNode] = useState(null);
    const [addSessionModalVisiable, setAddSessionModalVisiable] = useState(false);
    const [editForm] = Form.useForm();
    const [editSessionModalVisiable, setEditSessionModalVisiable] = useState(false);
    const [dataSource, setDataSource] = useState([]);
    const [sessionPropertyActiveKey, setSessionPropertyActiveKey] = useState(defaultSessionPropertyActiveKey);
    const intl = useIntl();

    const {
        prompt,
        treeData,
        setRefreshTreeData,
        sessionRootKey,
        selectedMenuKey,
        xshListWindowWidth
    } = useContext(AppContext);

    useEffect(() => {
        document.addEventListener("copy", e => {
            console.log(e)
        })
    }, []);

    function genSessionBaseInfo(showType: string) {
        return <>
            {
                showType === 'edit' &&
                <Form.Item
                    label="key"
                    name="key"
                    initialValue={""}
                    rules={[{required: true}]}
                >
                    <Input disabled={true}/>
                </Form.Item>
            }
            < Form.Item
                label={intl.formatMessage({id: 'sessionName'})}
                name="sessionName"
                initialValue={""}
                rules={defineValidatorWithErrMessage(intl.formatMessage({id: 'Please enter session name'}))}
            >
                <Input/>
            </Form.Item>

            <Form.Item
                label={intl.formatMessage({id: 'hostname'})}
                name="hostname"
                initialValue={""}
                rules={defineValidatorWithErrMessage(intl.formatMessage({id: 'Please enter the hostname'}))}
            >
                <Input/>
            </Form.Item>

            <Form.Item
                label={intl.formatMessage({id: 'port'})}
                name="port"
                initialValue={22}
                rules={defineValidatorWithErrMessage(intl.formatMessage({id: 'Please enter the port'}))}
            >
                <Input/>
            </Form.Item>

            <Form.Item
                label={intl.formatMessage({id: 'username'})}
                name="username"
                initialValue={""}
                rules={defineValidatorWithErrMessage(intl.formatMessage({id: 'Please enter username'}))}
            >
                <Input/>
            </Form.Item>

            <Form.Item
                label={intl.formatMessage({id: 'password'})}
                name="password"
                initialValue={""}
            >
                <Input.Password/>
            </Form.Item>

            <Form.Item
                label={intl.formatMessage({id: 'SessionList.privateKey.label'})}
                name="privatekey"
                getValueFromEvent={(args) => {
                    return args.path
                }}
            >
                <UploadInFormItem/>
            </Form.Item>

            <Form.Item
                label={intl.formatMessage({id: 'SessionList.passphrase.label'})}
                name="passphrase"
                initialValue={""}
            >
                <Input.Password/>
            </Form.Item>

            <Form.Item
                label="totp"
                name="totp"
                initialValue={""}
            >
                <Input/>
            </Form.Item>
        </>
    }

    const columns = [
        {
            title: intl.formatMessage({id: 'Expected string'}),
            dataIndex: 'expect',
            formItemProps: {
                rules: [
                    {
                        required: true,
                        whitespace: true,
                        message: intl.formatMessage({id: 'This item is required'}),
                    }
                ],
            },
        },
        {
            title: intl.formatMessage({id: 'Send Command'}),
            dataIndex: 'command',
            formItemProps: {
                rules: [
                    {
                        required: true,
                        whitespace: true,
                        message: intl.formatMessage({id: 'This item is required'}),
                    }
                ],
            },
        },
        {
            title: intl.formatMessage({id: 'operation'}),
            valueType: 'option',
            width: 50,
            render: () => {
                return null;
            },
        },
    ];

    function genLoginScript() {
        return <EditableProTable
            columns={columns}
            rowKey="id"
            value={dataSource}
            onChange={setDataSource}
            recordCreatorProps={{
                newRecordType: 'dataSource',
                record: () => ({
                    id: getUUid(),
                }),
            }}
            editable={{
                type: 'multiple',
                editableKeys: dataSource.map(item => item.id),
                actionRender: (row, config, defaultDoms) => {
                    return [defaultDoms.delete];
                },
                onValuesChange: (record, recordList) => {
                    setDataSource(recordList);
                },
            }}
        />
    }

    function genSessionFormProperties(showType: string) {
        return <Tabs style={{
            height: "60vh"
        }}
                     activeKey={sessionPropertyActiveKey}
                     tabBarGutter={4}
                     tabPosition={'left'}
                     onChange={(newActiveKey: string) => {
                         setSessionPropertyActiveKey(newActiveKey);
                     }}
                     items={[{
                         key: 'baseInfo',
                         label: intl.formatMessage({id: 'Basic Information'}),
                         forceRender: true,
                         children: genSessionBaseInfo(showType)
                     }, {
                         key: 'loginScript',
                         label: intl.formatMessage({id: 'Login Scripts'}),
                         forceRender: true,
                         children: genLoginScript()
                     }]}
        />
    }

    function calcSessionPropertyModalWidth() {
        switch (sessionPropertyActiveKey) {
            case "baseInfo":
            case 'loginScript':
                return '75vw';
            default:
                throw new Error("unexpect active key: " + sessionPropertyActiveKey);
        }
    }

    /**
     *
     * @param sessionConfId  session配置文件的id
     * @param filePath  session配置文件的路径
     * @param title     新建session会话的标题
     * @param callback  回调函数,参数是新创建的session会话的id
     */
    async function createNewSession(sessionConfId, filePath, title, encoding, callback) {
        const id = getUUid();
        setSessions(sessions => {
            const data = [...sessions];
            data.push({
                label: title,
                key: id,
                sessionConfId: sessionConfId,
                sessionConfPath: filePath,
                isConnected: false,
                encoding
            });
            return data;
        });

        sessionIdMapFileName[id] = filePath.substr(filePath.lastIndexOf(path.sep) + 1);
        // console.log(sessionIdMapFileName)
        setActiveKey(id);
        // xterm-256color
        util.request("session", {
            method: 'POST',
            body: JSON.stringify({
                id,
                sessionConfId,
                filePath
            }),
        }).then(res => {
            if (res.status) {
                message.error({
                    type: 'error',
                    content: res.status
                });
                return;
            }
            setSessions(sessions => {
                const data = [...sessions];
                for (let i = 0; i < data.length; i++) {
                    if (data[i].key == res.id) {
                        data[i].isConnected = true;
                        break;
                    }
                }
                return data;
            });
            callback && callback(res.id);
        })
    }


    const genTreeNodeMenu = (node) => {
        const items = [];
        // 非session节点
        if (!node.isLeaf) {
            items.push({
                    label: capitalizeFirstLetter(intl.formatMessage({id: 'new'})),
                    key: 'new',
                    children: [
                        {
                            label: (
                                <div onClick={(e) => {
                                    prompt(intl.formatMessage({id: 'Please enter a folder name'}), function (dirName) {
                                        if (!dirName) {
                                            return;
                                        }
                                        util.request('conf', {
                                            method: 'POST',
                                            body: JSON.stringify({
                                                type: 'SessionConfig',
                                                args: {
                                                    type: 'createDir',
                                                    path: node.path ? node.path + '/' + dirName : dirName
                                                }
                                            }),
                                        }).then(res => {
                                            message[res.status](res.msg);
                                            if (res.status == 'success') {
                                                setRefreshTreeData(e => e + 1)
                                            }
                                        })
                                    });
                                }}><FormattedMessage id={'folder'}/></div>
                            ),
                            key: 'addFolder',
                        }, {
                            label: (
                                <div onClick={(e) => {
                                    form.resetFields();
                                    setDataSource([]);
                                    setModalNode(node);
                                    setAddSessionModalVisiable(true);
                                }}><FormattedMessage id={'session'}/></div>
                            ),
                            key: 'addSession',
                        }
                    ]
                },
            );
        }

        // 复制文件夹或者某个session文件
        items.push({
            label: (
                <div onClick={(e) => {
                    util.request('conf', {
                        method: 'POST',
                        body: JSON.stringify({
                            type: 'SessionConfig',
                            args: {
                                type: 'duplicate',
                                path: node.path
                            }
                        }),
                    }).then(res => {
                        message[res.status](res.msg);
                        if (res.status == 'success') {
                            setRefreshTreeData(e => e + 1)
                        }
                    })
                }}><FormattedMessage id={'copy'}/></div>
            ),
            key: 'duplicateSession',
        });

        // 非root节点
        if (sessionRootKey != node.key) {
            items.push({
                label: (
                    <div onClick={(e) => {
                        setModalNode(node);
                        if (node.isLeaf) {
                            util.request('conf', {
                                method: 'POST',
                                body: JSON.stringify({
                                    type: 'SessionConfig',
                                    args: {
                                        type: 'readFile',
                                        path: node.path,
                                    }
                                }),
                            }).then(res => {
                                if (res.status !== 'success') {
                                    message[res.status](res.msg);
                                } else {
                                    const sessionInfo = JSON.parse(res.content);
                                    // console.log(sessionInfo)
                                    setDataSource(sessionInfo.login_script || []);
                                    editForm.setFieldsValue(Object.assign({key: node.key}, sessionInfo));
                                    setEditSessionModalVisiable(true);
                                }
                            })
                        } else {
                            editForm.setFieldsValue(node);
                            setEditSessionModalVisiable(true);
                        }
                    }}><FormattedMessage id={'edit'}/></div>
                ),
                key: 'edit',
            }, {
                label: (
                    <div onClick={(e) => {
                        util.request('conf', {
                            method: 'POST',
                            body: JSON.stringify({
                                type: 'SessionConfig',
                                args: {
                                    type: 'deleteFile',
                                    path: node.path
                                }
                            }),
                        }).then(res => {
                            message[res.status](res.msg);
                            if (res.status == 'success') {
                                setRefreshTreeData(e => e + 1);
                            }
                        })
                    }}><FormattedMessage id={'delete'}/></div>
                ),
                key: 'delete',
            });
        }

        return {items}
    }

    const titleRender = (nodeData: DataNode) => {
        return (
            <Dropdown menu={genTreeNodeMenu(nodeData)} trigger={['contextMenu']}>
                <div style={{display: 'inline-block', width: '100%'}} onDoubleClick={() => {
                    if (!nodeData.isLeaf) {
                        return;
                    }
                    createNewSession(nodeData.key, nodeData.path, nodeData.title, nodeData.encoding);
                }}>{nodeData.title}</div>
            </Dropdown>
        );
    }

    function moveFile(dragKey, dropKey) {
        util.request('conf', {
            method: 'POST',
            body: JSON.stringify({
                type: 'SessionConfig',
                args: {
                    type: 'moveFileOrDir',
                    src: dragKey,
                    dst: dropKey
                }
            }),
        }).then(res => {
            message[res.status](res.msg);
            if (res.status == 'success') {
                setRefreshTreeData(e => e + 1);
            }
        })
    }

    const onDrop: TreeProps['onDrop'] = (info) => {
        // console.log(info, "path.sep: " + fileSep());
        const dropKey = info.node.path;
        const dragKey = info.dragNode.path;
        let srcDir = dragKey;
        if (info.dragNode.isLeaf) {
            srcDir = dragKey.substr(0, dragKey.lastIndexOf(fileSep()));
            console.log("srcDir: ", srcDir);
        }
        let dstDir = dropKey;
        if (info.node.isLeaf) {
            dstDir = dropKey.substr(0, dropKey.lastIndexOf(fileSep()));
            console.log("dstDir: ", dstDir);
        }
        // console.log(info.node, info.dragNode)
        if (srcDir == dstDir) {
            return true;
        }
        moveFile(dragKey, dropKey);
    };

    function commonSessionModalClose() {
        setSessionPropertyActiveKey(defaultSessionPropertyActiveKey);
    }

    return <div>
        <DirectoryTree
            rootClassName="sessionList"
            className="draggable-tree"
            draggable
            blockNode
            autoExpandParent={false}
            titleRender={titleRender}
            onDrop={onDrop}
            treeData={treeData}
            style={{
                display: selectedMenuKey == NENU_SESSIONS ? 'block' : 'none'
            }}
        />

        <Modal
            width={calcSessionPropertyModalWidth()}
            maskClosable={false}
            open={editSessionModalVisiable}
            closable={false}
            onOk={() => {
                editForm.submit();
            }}
            onCancel={() => {
                setEditSessionModalVisiable(false);
                commonSessionModalClose();
            }}
        >
            <Form
                form={editForm}
                onFinish={(formInfo) => {
                    // console.log(formInfo)
                    if (!modalNode.isLeaf) {
                        util.request('conf', {
                            method: 'POST',
                            body: JSON.stringify({
                                type: 'SessionConfig',
                                args: {
                                    type: 'renameDir',
                                    src: modalNode.path,
                                    dst: formInfo.title
                                }
                            }),
                        }).then(res => {
                            message[res.status](res.msg);
                            if (res.status == 'success') {
                                setRefreshTreeData(e => e + 1);
                                setEditSessionModalVisiable(false);
                            }
                        })
                        return;
                    }
                    formInfo.login_script = dataSource || [];
                    if (typeof formInfo.privatekey != "string") {
                        formInfo.privatekey = formInfo.filePath;
                    }
                    util.request('conf', {
                        method: 'POST',
                        body: JSON.stringify({
                            type: 'SessionConfig',
                            args: {
                                type: 'editSession',
                                src: modalNode.path,
                                sessionInfo: formInfo
                            }
                        }),
                    }).then(res => {
                        message[res.status](res.msg);
                        if (res.status == 'success') {
                            setRefreshTreeData(e => e + 1);
                            setEditSessionModalVisiable(false);
                        }
                    })
                }}
            >
                {
                    <>
                        {
                            modalNode?.isLeaf ?
                                <>
                                    {genSessionFormProperties("edit")}
                                </>
                                : <Form.Item
                                    label="文件夹名"
                                    name="title"
                                    initialValue={modalNode?.title}
                                    rules={[{required: true, message: '请输入文件夹名!'}]}
                                >
                                    <Input/>
                                </Form.Item>
                        }
                    </>
                }
            </Form>
        </Modal>
        <Modal
            width={calcSessionPropertyModalWidth()}
            maskClosable={false}
            open={addSessionModalVisiable}
            closable={false}
            onOk={() => {
                form.submit();
            }}
            onCancel={() => {
                setAddSessionModalVisiable(false);
                commonSessionModalClose();
            }}
        >
            <Form
                form={form}
                onFinish={(formInfo) => {
                    formInfo.login_script = dataSource || [];
                    util.request('conf', {
                        method: 'POST',
                        body: JSON.stringify({
                            type: 'SessionConfig',
                            args: {
                                type: 'addFile',
                                dir: modalNode.path,
                                fileName: formInfo.sessionName,
                                content: JSON.stringify(formInfo)
                            }
                        }),
                    }).then(res => {
                        message[res.status](res.msg);
                        if (res.status == 'success') {
                            setRefreshTreeData(e => e + 1);
                            setAddSessionModalVisiable(false);
                        }
                    })
                }}
            >
                {genSessionFormProperties("create")}
            </Form>
        </Modal>
    </div>
}

export default React.memo(SessionList);
