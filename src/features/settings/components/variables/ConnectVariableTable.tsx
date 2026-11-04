import { EditableProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { useMemo } from 'react';
import type { VariableItem } from '../../model/types';
import { getUUid } from '@/util';
import { Input } from 'antd';
import { useIntl } from '@@/plugin-locale/localeExports';
import { capitalizeFirstLetter } from '@/shared/string';

interface ConnectVariableTableProps {
    value: VariableItem[];
    onChange: (value: VariableItem[]) => void;
}

/**
 * 校验变量列表：名称不能为空、不能重复
 * 返回错误信息，校验通过返回 null
 */
export function validateVariables(
    variables: VariableItem[],
    getMessage: (id: string) => string,
): string | null {
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
        return `exist same name: ${[...duplicates].join(',')}`;
    }
    return null;
}

const ConnectVariableTable = ({ value, onChange }: ConnectVariableTableProps) => {
    const intl = useIntl();

    const columns = useMemo<ProColumns<VariableItem>[]>(
        () => [
            {
                title: intl.formatMessage({ id: 'Variable Name' }),
                dataIndex: 'name',
            },
            {
                title: intl.formatMessage({ id: 'Variable Value' }),
                renderFormItem: () => {
                    return <Input.Password />;
                },
                render: (_text, record) => [
                    <Input.Password
                        key="value"
                        placeholder="input password"
                        defaultValue={record.value}
                    />,
                ],
                dataIndex: 'value',
            },
            {
                title: capitalizeFirstLetter(intl.formatMessage({ id: 'operation' })),
                valueType: 'option',
                width: 100,
                render: () => {
                    return null;
                },
            },
        ],
        [intl],
    );

    return (
        <EditableProTable<VariableItem>
            columns={columns}
            rowKey="id"
            value={value}
            onChange={(records) => onChange([...records])}
            recordCreatorProps={{
                newRecordType: 'dataSource',
                record: () => ({
                    id: getUUid(),
                }),
            }}
            editable={{
                type: 'multiple',
                editableKeys: value.map((item) => item.id),
                actionRender: (row, config, defaultDoms) => {
                    return [defaultDoms.delete];
                },
                onValuesChange: (record, recordList) => {
                    onChange(recordList);
                },
            }}
        />
    );
};

export default ConnectVariableTable;
