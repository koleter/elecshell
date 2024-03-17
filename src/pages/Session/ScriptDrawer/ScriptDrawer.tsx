import React, {useEffect, useState} from "react";
import {Button, Drawer, Form, Input, message, Modal, Radio, Select} from "antd";
import { PythonOutlined, FileTextOutlined } from '@ant-design/icons';
import Upload from "../components/upload/Upload"
import {ProList} from "@ant-design/pro-components";
import {FormattedMessage} from "@@/plugin-locale/localeExports";
import {request} from "@@/plugin-request/request";
import util, {showMessage} from "@/util";
import {sessionIdMapFileName, sessionIdRef} from "@/pages/Session/main/Main";
import ScriptOwner from "@/pages/Session/ScriptDrawer/ScriptOwner";

const TYPE_RUN_PYTHON_SCRIPT = 1;
const TYPE_SEND_STRING = 2;

const ScriptDrawer: React.FC = (props) => {
    // @ts-ignore
    const {activeKey, drawerOpen, setDrawerOpen} = props;
    const [editScriptForm] = Form.useForm();

    const [scriptData, setScriptData] = useState([]);
    const [scriptSearchValue, setScriptSearchValue] = useState("");
    const [editScriptModalVisiable, setEditScriptModalVisiable] = useState(false);
    const [refreshScriptData, setRefreshScriptData] = useState(0);
    const [addScriptModalVisiable, setAddScriptModalVisiable] = useState(false);
    const [addScriptForm] = Form.useForm();

    const [scriptType, setScriptType] = useState(TYPE_RUN_PYTHON_SCRIPT);

    useEffect(() => {
        request(util.baseUrl + 'conf', {
            method: 'GET',
            params: {
                type: 'ScriptConfig',
            },
        }).then(res => {
            if (res.status !== 'success') {
                message[res.status](res.msg);
            }
            setScriptData(res.scriptData);
        })
    }, [refreshScriptData])

    function genScriptFormProperties() {
        return <>
            <Form.Item
                label="标签"
                name="name"
                initialValue={""}
                rules={[{required: true, message: '请输入标签!'}]}
            >
                <Input/>
            </Form.Item>

            <Form.Item
                initialValue={TYPE_RUN_PYTHON_SCRIPT}
                name="scriptType"
                rules={[{required: true, message: '请选择按钮类型!'}]}
                label="类型">
                <Radio.Group onChange={(e) => {
                    setScriptType(e.target.value);
                }}>
                    <Radio value={TYPE_RUN_PYTHON_SCRIPT}>运行python脚本</Radio>
                    <Radio value={TYPE_SEND_STRING}>发送字符串</Radio>
                </Radio.Group>
            </Form.Item>

            {scriptType === TYPE_RUN_PYTHON_SCRIPT ?
                <Form.Item
                    label="python脚本文件路径"
                    name="scriptPath"
                    getValueFromEvent={(args) => {
                        return args.path
                    }}
                    rules={[{required: true, message: '请选择python脚本文件!'}]}
                >
                    <Upload>
                    </Upload>
                </Form.Item>
                :
                <Form.Item
                    label="字符串"
                    name="strings"
                    rules={[{required: true, message: '请输入要发送的字符串!'}]}
                >
                    <Input.TextArea rows={4}/>
                </Form.Item>
            }
            <ScriptOwner></ScriptOwner>
            {/*<Form.Item*/}
            {/*    name="scriptOwner"*/}
            {/*    rules={[{required: true, message: '脚本归属不能为空!'}]}*/}
            {/*    label="脚本归属">*/}
            {/*    <Radio.Group>*/}
            {/*        <Radio value="common">*/}
            {/*            <FormattedMessage*/}
            {/*                key="pages.session.common"*/}
            {/*                id="pages.session.common"*/}
            {/*                defaultMessage="公共"*/}
            {/*            />*/}
            {/*        </Radio>*/}
            {/*        <Radio value={activeKey}>*/}
            {/*            <FormattedMessage*/}
            {/*                key="pages.session.currentSession"*/}
            {/*                id="pages.session.currentSession"*/}
            {/*                defaultMessage="当前会话"*/}
            {/*            />*/}
            {/*        </Radio>*/}
            {/*    </Radio.Group>*/}
            {/*</Form.Item>*/}
        </>
    }

    return <>
        <Drawer
            title={`脚本`}
            placement="right"
            onClose={() => {
                setDrawerOpen(false);
            }}
            open={drawerOpen}
            size={'large'}
        >

            <ProList
                rowKey="name"
                dataSource={scriptData.filter(item => (!item.scriptOwner || item.scriptOwner == sessionIdMapFileName[activeKey]) && item.title.name.indexOf(scriptSearchValue) > -1)}
                metas={{
                    title: {
                        render: (text, row) => {
                            let icon;
                            if (row.scriptType == TYPE_RUN_PYTHON_SCRIPT) {
                                icon = <PythonOutlined/>;
                            } else {
                                icon = <FileTextOutlined />;
                            }
                            return <Button icon={icon} onClick={() => {
                                if (!sessionIdRef[activeKey]) {
                                    showMessage({
                                        status: 'error',
                                        content: 'scripts cannot be executed in a closed session'
                                    });
                                    return;
                                }

                                if (row.scriptType == TYPE_RUN_PYTHON_SCRIPT) {
                                    sessionIdRef[activeKey].send({
                                        type: 'exec',
                                        path: row.scriptPath,
                                        sessionId: activeKey,
                                        xshConfId: sessionIdRef[activeKey].sessionConfId,
                                        scriptType: row.scriptType
                                    })
                                } else {
                                    sessionIdRef[activeKey].sendData(row.strings);
                                }
                            }
                            }>{text.name}</Button>
                        }
                    },
                    actions: {
                        render: (text, row) => [
                            <a
                                key="link"
                                onClick={() => {
                                    const fields = Object.assign(row, {name: row.title.name})
                                    setScriptType(row.scriptType);
                                    editScriptForm.setFieldsValue(fields);
                                    setEditScriptModalVisiable(true);
                                }}
                            >
                                <FormattedMessage
                                    key="loginWith"
                                    id="pages.session.edit"
                                    defaultMessage="编辑"
                                />
                            </a>,
                            <a
                                key="view"
                                onClick={() => {
                                    request(util.baseUrl + 'conf', {
                                        method: 'POST',
                                        body: JSON.stringify({
                                            type: 'ScriptConfig',
                                            args: {
                                                type: 'deleteFile',
                                                path: row.file
                                            }
                                        }),
                                    }).then(res => {
                                        message[res.status](res.msg);
                                        if (res.status == 'success') {
                                            setRefreshScriptData(e => e + 1);
                                        }
                                    })
                                }}
                            >
                                <FormattedMessage
                                    key="pages.session.delete"
                                    id="pages.session.delete"
                                    defaultMessage="删除"
                                />
                            </a>,
                        ],
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
                                setScriptSearchValue(inputValue);
                            }}/>
                        </Form.Item>
                        ,
                        <Form.Item>
                            <Button key="add" type="primary" onClick={() => {
                                setScriptType(TYPE_RUN_PYTHON_SCRIPT);
                                addScriptForm.resetFields();
                                setAddScriptModalVisiable(true);
                            }}>
                                <FormattedMessage
                                    key="loginWith"
                                    id="pages.session.add"
                                    defaultMessage="添加"
                                />
                            </Button>
                        </Form.Item>
                    ];
                }}
            />
        </Drawer>

        <Modal
            maskClosable={false}
            open={addScriptModalVisiable}
            closable={false}
            onOk={() => {
                addScriptForm.submit();
            }}
            onCancel={() => {
                setAddScriptModalVisiable(false);
            }}
        >
            <Form
                form={addScriptForm}
                onFinish={(formInfo) => {
                    console.log(formInfo);
                    if (formInfo.scriptOwner == 'common') {
                        formInfo.scriptOwner = "";
                    } else {
                        formInfo.scriptOwner = sessionIdMapFileName[activeKey];
                    }
                    request(util.baseUrl + 'conf', {
                        method: 'POST',
                        body: JSON.stringify({
                            type: 'ScriptConfig',
                            args: {
                                type: 'addFile',
                                content: JSON.stringify(formInfo)
                            }
                        }),
                    }).then(res => {
                        message[res.status](res.msg);
                        if (res.status == 'success') {
                            setAddScriptModalVisiable(false);
                            setRefreshScriptData(e => e + 1);
                        }
                    })
                }}
            >
                {genScriptFormProperties()}
            </Form>
        </Modal>

        <Modal
            maskClosable={false}
            open={editScriptModalVisiable}
            closable={false}
            onOk={() => {
                editScriptForm.submit();
            }}
            onCancel={() => {
                setEditScriptModalVisiable(false);
            }}
        >
            <Form
                form={editScriptForm}
                onFinish={(formInfo) => {
                    console.log(formInfo)
                    request(util.baseUrl + 'conf', {
                        method: 'POST',
                        body: JSON.stringify({
                            type: 'ScriptConfig',
                            args: {
                                type: 'editScript',
                                ...formInfo
                            }
                        }),
                    }).then(res => {
                        message[res.status](res.msg);
                        if (res.status == 'success') {
                            setEditScriptModalVisiable(false);
                            setRefreshScriptData(e => e + 1);
                        }
                    })
                }}
            >
                <Form.Item
                    name="file"
                    style={{display: 'none'}}
                >
                    <Input/>
                </Form.Item>
                {genScriptFormProperties()}
            </Form>
        </Modal>
    </>
}

export default ScriptDrawer;
