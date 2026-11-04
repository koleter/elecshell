import React, { useState, useEffect } from 'react';
import { Form, TreeSelect, Checkbox } from 'antd';
import { useCatalog } from '../../catalog/model/CatalogProvider';
import './scriptOwner.less';
import { FormattedMessage, useIntl } from '@@/plugin-locale/localeExports';

interface OwnerValue {
    isCommon?: boolean;
    owners?: string[];
}
const Owner: React.FC<{ value?: OwnerValue; onChange?: (value: OwnerValue) => void }> = ({
    value = {},
    onChange,
}) => {
    const { treeData } = useCatalog();
    const [isCommon, setIsCommon] = useState(value.isCommon);
    const [owners, setOwners] = useState(value.owners);

    useEffect(() => {
        setIsCommon(value.isCommon);
        setOwners(value.owners);
    }, [value]);

    const triggerChange = (changedValue: Partial<OwnerValue>) => {
        onChange?.({ isCommon, owners, ...value, ...changedValue });
    };

    const tProps = {
        treeData: (treeData && treeData[0]?.children) || [],
        onChange: function (selectedOwners: string[]) {
            setOwners(selectedOwners);
            triggerChange({ owners: selectedOwners });
        },
        treeCheckable: true,
        // showCheckedStrategy: SHOW_PARENT,
        placeholder: 'Please select',
        fieldNames: {
            label: 'title',
            value: 'key',
            children: 'children',
        },
        value: owners,
    };

    return (
        <div className={'flexWrapper'}>
            <div
                style={{
                    width: '80px',
                }}
            >
                <Checkbox
                    checked={isCommon}
                    onChange={(e) => {
                        console.log(`checked = ${e.target.checked}`);
                        setIsCommon(e.target.checked);
                        triggerChange({ isCommon: e.target.checked });
                    }}
                >
                    <FormattedMessage id={'common'} />
                </Checkbox>
            </div>

            <TreeSelect disabled={isCommon} {...tProps} />
        </div>
    );
};

const ScriptOwner: React.FC = () => {
    const intl = useIntl();
    return (
        <Form.Item
            name="scriptOwner"
            rules={[
                {
                    required: true,
                    message: intl.formatMessage({ id: 'ScriptOwner.scriptOwner can not be empty' }),
                },
            ]}
            label={intl.formatMessage({ id: 'ScriptOwner.scriptOwner' })}
        >
            <Owner />
        </Form.Item>
    );
};

export default ScriptOwner;
