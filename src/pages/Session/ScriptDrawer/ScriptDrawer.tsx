import React, {useContext, useEffect, useState} from "react";
import {Button, Drawer, Form, Input, message, Modal, Popconfirm, Radio, Select} from "antd";
import { PythonOutlined, FileTextOutlined } from '@ant-design/icons';

import {ProList} from "@ant-design/pro-components";
import {FormattedMessage, useIntl} from "@@/plugin-locale/localeExports";
import {request} from "@@/plugin-request/request";
import util, {showMessage} from "@/util";
import {sessionIdMapFileName, sessionIdRef} from "@/pages/Session/main/Main";
import ScriptOwner from "@/pages/Session/ScriptDrawer/ScriptOwner";
import UploadInFormItem from "../components/upload/Upload";
import {AppContext} from "@/pages/context/AppContextProvider";
import {capitalizeFirstLetter} from "@/pages/util/string";

const TYPE_RUN_PYTHON_SCRIPT = 1;
const TYPE_SEND_STRING = 2;

const ScriptDrawer: React.FC = (props) => {
    // @ts-ignore
    const {activeKey, drawerOpen, setDrawerOpen} = props;
    const [editScriptForm] = Form.useForm();

    const [scriptSearchValue, setScriptSearchValue] = useState("");
    const [editScriptModalVisiable, setEditScriptModalVisiable] = useState(false);

    const [addScriptModalVisiable, setAddScriptModalVisiable] = useState(false);
    const [addScriptForm] = Form.useForm();

    const [scriptType, setScriptType] = useState(TYPE_RUN_PYTHON_SCRIPT);
    const intl = useIntl();

    const {
        scriptData, setScriptData, refreshScriptData, setRefreshScriptData
    } = useContext(AppContext);

    function genScriptFormProperties() {
        return <>
            <Form.Item
                label={capitalizeFirstLetter(intl.formatMessage({id: 'label'}))}
                name="name"
                initialValue={""}
                rules={[{required: true, message: capitalizeFirstLetter(intl.formatMessage({id: 'please input label'}))}]}
            >
                <Input/>
            </Form.Item>

            <Form.Item
                initialValue={TYPE_RUN_PYTHON_SCRIPT}
                name="scriptType"
                rules={[{required: true, message: intl.formatMessage({id: 'Please select button type'})}]}
                label={capitalizeFirstLetter(intl.formatMessage({id: 'type'}))}>
                <Radio.Group onChange={(e) => {
                    setScriptType(e.target.value);
                }}>
                    <Radio value={TYPE_RUN_PYTHON_SCRIPT}><FormattedMessage id={'Run Python Script'}/></Radio>
                    <Radio value={TYPE_SEND_STRING}><FormattedMessage id={'Sending string'}/></Radio>
                </Radio.Group>
            </Form.Item>

            {scriptType === TYPE_RUN_PYTHON_SCRIPT ?
                <Form.Item
                    label={intl.formatMessage({id: 'Python file path'})}
                    name="scriptPath"
                    getValueFromEvent={(args) => {
                        return args.path
                    }}
                    rules={[{required: true, message: intl.formatMessage({id: 'Please select the python file'})}]}
                >
                    <UploadInFormItem accept={".py"}/>
                </Form.Item>
                :
                <Form.Item
                    label={capitalizeFirstLetter(intl.formatMessage({id: 'strings'}))}
                    name="strings"
                    rules={[{required: true, message: intl.formatMessage({id: 'Please enter the string to send'})}]}
                >
                    <Input.TextArea rows={4}/>
                </Form.Item>
            }
            <ScriptOwner/>
        </>
    }

    return <>
        <Drawer
            title={capitalizeFirstLetter(intl.formatMessage({id: 'script'}))}
            placement="right"
            onClose={() => {
                setDrawerOpen(false);
                setScriptSearchValue("");
            }}
            open={drawerOpen}
            size={'large'}
        >

            <ProList
                dataSource={scriptData.filter(item => {
                    return (item.scriptOwner.isCommon || item.scriptOwner.owners.includes(sessionIdMapFileName[activeKey])) && item.title.name.indexOf(scriptSearchValue) > -1;
                })}
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
                                        content: intl.formatMessage({id: 'scripts cannot be executed in a closed session'})
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
                                    const fields = Object.assign(row, {name: row.title.name});
                                    // console.log(fields, row);
                                    setScriptType(row.scriptType);
                                    editScriptForm.setFieldsValue(fields);
                                    setEditScriptModalVisiable(true);
                                }}
                            >
                                <FormattedMessage id="edit"/>
                            </a>,
                            <Popconfirm
                                title={intl.formatMessage({id: "Delete the script"})}
                                onConfirm={() => {
                                    util.request('conf', {
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
                                <a
                                    key="view"
                                >
                                    <FormattedMessage id="delete"/>
                                </a>
                            </Popconfirm>
                            ,
                        ],
                    },
                }}
                toolBarRender={() => {
                    return [
                        <Form.Item
                            label={<FormattedMessage id="search"/>}
                        >
                            <Input style={{float: 'left'}} value={scriptSearchValue} onChange={(e) => {
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
                                <FormattedMessage id="add"/>
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
                initialValues={{
                    scriptOwner: {
                        isCommon: false,
                        owners: [sessionIdMapFileName[activeKey]],
                    },
                }}
                onFinish={(formInfo) => {
                    console.log(formInfo);
                    util.request('conf', {
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
                    util.request('conf', {
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
