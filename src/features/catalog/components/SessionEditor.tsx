import React from 'react';
import { Form, Input, Tabs } from 'antd';
import { EditableProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { useIntl } from '@@/plugin-locale/localeExports';
import UploadInFormItem from '../../../shared/components/Upload';
import { defineValidatorWithErrMessage, getUUid } from '../../../util';
import type { LoginScriptStep } from '../model/types';

interface Props {
    mode: 'create' | 'edit';
    dataSource: LoginScriptStep[];
    setDataSource: (steps: LoginScriptStep[]) => void;
    sessionPropertyActiveKey: string;
    setSessionPropertyActiveKey: (key: string) => void;
}

const SessionEditor: React.FC<Props> = ({
    mode,
    dataSource,
    setDataSource,
    sessionPropertyActiveKey,
    setSessionPropertyActiveKey,
}) => {
    const intl = useIntl();
    function genSessionBaseInfo(showType: string) {
        return (
            <>
                {showType === 'edit' && (
                    <Form.Item
                        label="key"
                        name="key"
                        initialValue={''}
                        rules={[{ required: true }]}
                    >
                        <Input disabled={true} />
                    </Form.Item>
                )}
                <Form.Item
                    label={intl.formatMessage({ id: 'sessionName' })}
                    name="sessionName"
                    initialValue={''}
                    rules={defineValidatorWithErrMessage(
                        intl.formatMessage({ id: 'Please enter session name' }),
                    )}
                >
                    <Input />
                </Form.Item>

                <Form.Item
                    label={intl.formatMessage({ id: 'hostname' })}
                    name="hostname"
                    initialValue={''}
                    rules={defineValidatorWithErrMessage(
                        intl.formatMessage({ id: 'Please enter the hostname' }),
                    )}
                >
                    <Input />
                </Form.Item>

                <Form.Item
                    label={intl.formatMessage({ id: 'port' })}
                    name="port"
                    initialValue={22}
                    rules={defineValidatorWithErrMessage(
                        intl.formatMessage({ id: 'Please enter the port' }),
                    )}
                >
                    <Input />
                </Form.Item>

                <Form.Item
                    label={intl.formatMessage({ id: 'username' })}
                    name="username"
                    initialValue={''}
                    rules={defineValidatorWithErrMessage(
                        intl.formatMessage({ id: 'Please enter username' }),
                    )}
                >
                    <Input />
                </Form.Item>

                <Form.Item
                    label={intl.formatMessage({ id: 'password' })}
                    name="password"
                    initialValue={''}
                >
                    <Input.Password />
                </Form.Item>

                <Form.Item
                    label={intl.formatMessage({ id: 'SessionList.privateKey.label' })}
                    name="privatekey"
                    getValueFromEvent={(args) => {
                        return args.path;
                    }}
                >
                    <UploadInFormItem />
                </Form.Item>

                <Form.Item
                    label={intl.formatMessage({ id: 'SessionList.passphrase.label' })}
                    name="passphrase"
                    initialValue={''}
                >
                    <Input.Password />
                </Form.Item>

                <Form.Item label="totp" name="totp" initialValue={''}>
                    <Input />
                </Form.Item>
            </>
        );
    }

    const columns: ProColumns<LoginScriptStep>[] = [
        {
            title: intl.formatMessage({ id: 'Expected string' }),
            dataIndex: 'expect',
            formItemProps: {
                rules: [
                    {
                        required: true,
                        whitespace: true,
                        message: intl.formatMessage({ id: 'This item is required' }),
                    },
                ],
            },
        },
        {
            title: intl.formatMessage({ id: 'Send Command' }),
            dataIndex: 'command',
            formItemProps: {
                rules: [
                    {
                        required: true,
                        whitespace: true,
                        message: intl.formatMessage({ id: 'This item is required' }),
                    },
                ],
            },
        },
        {
            title: intl.formatMessage({ id: 'operation' }),
            valueType: 'option',
            width: 80,
            render: () => {
                return null;
            },
        },
    ];

    function genLoginScript() {
        return (
            <EditableProTable
                columns={columns}
                rowKey="id"
                value={dataSource}
                onChange={(records) => setDataSource([...records])}
                recordCreatorProps={{
                    newRecordType: 'dataSource',
                    record: () => ({
                        id: getUUid(),
                    }),
                }}
                editable={{
                    type: 'multiple',
                    editableKeys: dataSource.map((item) => item.id),
                    actionRender: (row, config, defaultDoms) => {
                        return [defaultDoms.delete];
                    },
                    onValuesChange: (record, recordList) => {
                        setDataSource(recordList);
                    },
                }}
            />
        );
    }

    function genSessionFormProperties(showType: string) {
        return (
            <Tabs
                style={{
                    height: '60vh',
                }}
                activeKey={sessionPropertyActiveKey}
                tabBarGutter={4}
                tabPosition={'left'}
                onChange={(newActiveKey: string) => {
                    setSessionPropertyActiveKey(newActiveKey);
                }}
                items={[
                    {
                        key: 'baseInfo',
                        label: intl.formatMessage({ id: 'Basic Information' }),
                        forceRender: true,
                        children: genSessionBaseInfo(showType),
                    },
                    {
                        key: 'loginScript',
                        label: intl.formatMessage({ id: 'Login Scripts' }),
                        forceRender: true,
                        children: genLoginScript(),
                    },
                ]}
            />
        );
    }

    return genSessionFormProperties(mode);
};
export default SessionEditor;
