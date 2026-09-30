import {EditableProTable} from '@ant-design/pro-components';
import React, {useMemo} from 'react';
import {getUUid} from "@/util";
import {Input} from 'antd';
import {useIntl} from '@@/plugin-locale/localeExports';
import {capitalizeFirstLetter} from "@/pages/util/string";

export interface VariableItem {
    id: string;
    name?: string;
    value?: string;
}

interface ConnectVariableTableProps {
    value: VariableItem[];
    onChange: (value: VariableItem[]) => void;
}

/**
 * 校验变量列表：名称不能为空、不能重复
 * 返回错误信息，校验通过返回 null
 */
export function validateVariables(variables: VariableItem[], getMessage: (id: string) => string): string | null {
    const names = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of variables || []) {
        if (!item.name) {
            return getMessage('Variable name cannot be empty');
        }
        if (names.has(item.name)) {
            duplicates.add(item.name);
        }
        names.add(item.name);
    }
    if (duplicates.size > 0) {
        return `exist same name: ${[...duplicates].join(",")}`;
    }
    return null;
}

const ConnectVariableTable = ({value, onChange}: ConnectVariableTableProps) => {
    const intl = useIntl();

    const columns = useMemo(() => [
        {
            title: intl.formatMessage({id: 'Variable Name'}),
            dataIndex: 'name'
        },
        {
            title: intl.formatMessage({id: 'Variable Value'}),
            renderFormItem: (_, {isEditable}) => {
                return <Input.Password/>;
            },
            render: (text, record, _, action) => [
                <Input.Password key="value" placeholder="input password" defaultValue={text}/>
            ],
            dataIndex: 'value'
        },
        {
            title: capitalizeFirstLetter(intl.formatMessage({id: 'operation'})),
            valueType: 'option',
            width: 100,
            render: () => {
                return null;
            },
        },
    ], [intl.locale]);

    return <EditableProTable
        columns={columns}
        rowKey="id"
        value={value}
        onChange={onChange}
        recordCreatorProps={{
            newRecordType: 'dataSource',
            record: () => ({
                id: getUUid(),
            }),
        }}
        editable={{
            type: 'multiple',
            editableKeys: value.map(item => item.id),
            actionRender: (row, config, defaultDoms) => {
                return [defaultDoms.delete];
            },
            onValuesChange: (record, recordList) => {
                onChange(recordList);
            },
        }}
    />
}

export default ConnectVariableTable;
