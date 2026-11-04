import { scriptService } from '../services/scriptService';
import React, { useState } from 'react';
import { Button, Drawer, Form, Input, message, Modal, Popconfirm, Radio } from 'antd';
import { PythonOutlined, FileTextOutlined } from '@ant-design/icons';

import { ProList } from '@ant-design/pro-components';
import { FormattedMessage, useIntl } from '@@/plugin-locale/localeExports';
import { showMessage } from '@/util';
import { sessionService } from '../../sessions/services/sessionService';
import { useScripts } from '../model/ScriptsProvider';
import { useWorkspace } from '../../workspace/model/WorkspaceProvider';
import ScriptOwner from '@/features/scripts/components/ScriptOwner';
import UploadInFormItem from '../../../shared/components/Upload';
import { capitalizeFirstLetter } from '@/shared/string';

const TYPE_RUN_PYTHON_SCRIPT = 1;
const TYPE_SEND_STRING = 2;

interface ScriptDrawerProps {
    drawerOpen: boolean;
    setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const ScriptDrawer: React.FC<ScriptDrawerProps> = (props) => {
    const { drawerOpen, setDrawerOpen } = props;
    const { activeKey } = useWorkspace();
    const [editScriptForm] = Form.useForm();

    const [scriptSearchValue, setScriptSearchValue] = useState('');
    const [editScriptModalVisiable, setEditScriptModalVisiable] = useState(false);

    const [addScriptModalVisiable, setAddScriptModalVisiable] = useState(false);
    const [addScriptForm] = Form.useForm();

    const [scriptType, setScriptType] = useState(TYPE_RUN_PYTHON_SCRIPT);
    const intl = useIntl();

    const { scriptData, reloadScripts } = useScripts();

    function genScriptFormProperties() {
        return (
            <>
                <Form.Item
                    label={capitalizeFirstLetter(intl.formatMessage({ id: 'label' }))}
                    name="name"
                    initialValue={''}
                    rules={[
                        {
                            required: true,
                            message: capitalizeFirstLetter(
                                intl.formatMessage({ id: 'please input label' }),
                            ),
                        },
                    ]}
                >
                    <Input />
                </Form.Item>

                <Form.Item
                    initialValue={TYPE_RUN_PYTHON_SCRIPT}
                    name="scriptType"
                    rules={[
                        {
                            required: true,
                            message: intl.formatMessage({ id: 'Please select button type' }),
                        },
                    ]}
                    label={capitalizeFirstLetter(intl.formatMessage({ id: 'type' }))}
                >
                    <Radio.Group
                        onChange={(e) => {
                            setScriptType(e.target.value);
                        }}
                    >
                        <Radio value={TYPE_RUN_PYTHON_SCRIPT}>
                            <FormattedMessage id={'Run Python Script'} />
                        </Radio>
                        <Radio value={TYPE_SEND_STRING}>
                            <FormattedMessage id={'Sending string'} />
                        </Radio>
                    </Radio.Group>
                </Form.Item>

                {scriptType === TYPE_RUN_PYTHON_SCRIPT ? (
                    <Form.Item
                        label={intl.formatMessage({ id: 'Python file path' })}
                        name="scriptPath"
                        getValueFromEvent={(args) => {
                            return args.path;
                        }}
                        rules={[
                            {
                                required: true,
                                message: intl.formatMessage({
                                    id: 'Please select the python file',
                                }),
                            },
                        ]}
                    >
                        <UploadInFormItem accept={'.py'} />
                    </Form.Item>
                ) : (
                    <Form.Item
                        label={capitalizeFirstLetter(intl.formatMessage({ id: 'strings' }))}
                        name="strings"
                        rules={[
                            {
                                required: true,
                                message: intl.formatMessage({
                                    id: 'Please enter the string to send',
                                }),
                            },
                        ]}
                    >
                        <Input.TextArea rows={4} />
                    </Form.Item>
                )}
                <ScriptOwner />
            </>
        );
    }

    return (
        <>
            <Drawer
                title={capitalizeFirstLetter(intl.formatMessage({ id: 'script' }))}
                placement="right"
                onClose={() => {
                    setDrawerOpen(false);
                    setScriptSearchValue('');
                }}
                open={drawerOpen}
                size={'large'}
            >
                <ProList
                    dataSource={scriptData.filter((item) => {
                        return (
                            (item.scriptOwner.isCommon ||
                                item.scriptOwner.owners.includes(
                                    sessionService.configurationName(activeKey) || '',
                                )) &&
                            item.title.name.indexOf(scriptSearchValue) > -1
                        );
                    })}
                    metas={{
                        title: {
                            render: (text, row) => {
                                let icon;
                                if (row.scriptType == TYPE_RUN_PYTHON_SCRIPT) {
                                    icon = <PythonOutlined />;
                                } else {
                                    icon = <FileTextOutlined />;
                                }
                                return (
                                    <Button
                                        icon={icon}
                                        onClick={() => {
                                            if (!sessionService.isConnected(activeKey)) {
                                                showMessage({
                                                    status: 'error',
                                                    content: intl.formatMessage({
                                                        id: 'scripts cannot be executed in a closed session',
                                                    }),
                                                });
                                                return;
                                            }

                                            if (row.scriptType == TYPE_RUN_PYTHON_SCRIPT) {
                                                sessionService.runScript(
                                                    activeKey,
                                                    row.scriptPath,
                                                    row.scriptType,
                                                );
                                            } else {
                                                sessionService.sendCommand(activeKey, row.strings);
                                            }
                                        }}
                                    >
                                        {row.title.name}
                                    </Button>
                                );
                            },
                        },
                        actions: {
                            render: (text, row) => [
                                <a
                                    key="link"
                                    onClick={() => {
                                        const fields = Object.assign(row, { name: row.title.name });
                                        // console.log(fields, row);
                                        setScriptType(row.scriptType);
                                        editScriptForm.setFieldsValue(fields);
                                        setEditScriptModalVisiable(true);
                                    }}
                                >
                                    <FormattedMessage id="edit" />
                                </a>,
                                <Popconfirm
                                    key="delete"
                                    title={intl.formatMessage({ id: 'Delete the script' })}
                                    onConfirm={() => {
                                        scriptService
                                            .update({
                                                type: 'deleteFile',
                                                path: row.file,
                                            })
                                            .then((res) => {
                                                message[res.status](res.msg);
                                                if (res.status == 'success') {
                                                    reloadScripts();
                                                }
                                            });
                                    }}
                                >
                                    <a key="view">
                                        <FormattedMessage id="delete" />
                                    </a>
                                </Popconfirm>,
                            ],
                        },
                    }}
                    toolBarRender={() => {
                        return [
                            <Form.Item key="search" label={<FormattedMessage id="search" />}>
                                <Input
                                    style={{ float: 'left' }}
                                    value={scriptSearchValue}
                                    onChange={(e) => {
                                        const { value: inputValue } = e.target;
                                        setScriptSearchValue(inputValue);
                                    }}
                                />
                            </Form.Item>,
                            <Form.Item key="create">
                                <Button
                                    key="add"
                                    type="primary"
                                    onClick={() => {
                                        setScriptType(TYPE_RUN_PYTHON_SCRIPT);
                                        addScriptForm.resetFields();
                                        setAddScriptModalVisiable(true);
                                    }}
                                >
                                    <FormattedMessage id="add" />
                                </Button>
                            </Form.Item>,
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
                            owners: [sessionService.configurationName(activeKey)],
                        },
                    }}
                    onFinish={(formInfo) => {
                        console.log(formInfo);
                        scriptService
                            .update({
                                type: 'addFile',
                                content: JSON.stringify(formInfo),
                            })
                            .then((res) => {
                                message[res.status](res.msg);
                                if (res.status == 'success') {
                                    setAddScriptModalVisiable(false);
                                    reloadScripts();
                                }
                            });
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
                        console.log(formInfo);
                        scriptService
                            .update({
                                type: 'editScript',
                                ...formInfo,
                            })
                            .then((res) => {
                                message[res.status](res.msg);
                                if (res.status == 'success') {
                                    setEditScriptModalVisiable(false);
                                    reloadScripts();
                                }
                            });
                    }}
                >
                    <Form.Item name="file" style={{ display: 'none' }}>
                        <Input />
                    </Form.Item>
                    {genScriptFormProperties()}
                </Form>
            </Modal>
        </>
    );
};

export default ScriptDrawer;
