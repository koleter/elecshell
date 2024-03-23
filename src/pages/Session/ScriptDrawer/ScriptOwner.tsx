import React, {useState, useContext, useEffect} from 'react';
import {Form, TreeSelect, Checkbox} from 'antd';
import {AppContext} from "@/pages/context/AppContextProvider";
import './scriptOwner.less'


const Owner: React.FC = ({value = {}, onChange}) => {
    const {treeData, activeKey} = useContext(AppContext);
    const [isCommon, setIsCommon] = useState(value.isCommon);
    const [owners, setOwners] = useState(value.owners);

    useEffect(() => {
        setIsCommon(value.isCommon);
        setOwners(value.owners);
    }, [value])

    const triggerChange = (changedValue) => {
        onChange?.({isCommon, owners, ...value, ...changedValue});
    };

    const tProps = {
        treeData: treeData && treeData[0]?.children || [],
        onChange: function (value, label, extra) {
            console.log(value, label, extra);
            setOwners(value);
            triggerChange({owners: value});
        },
        treeCheckable: true,
        // showCheckedStrategy: SHOW_PARENT,
        placeholder: 'Please select',
        fieldNames: {
            label: 'title',
            value: 'key',
            children: 'children'
        },
        value: owners
    };

    return (
        <div className={'flexWrapper'} >
            <div style={{
                width: '80px'
            }}>
                <Checkbox checked={isCommon} onChange={(e) => {
                    console.log(`checked = ${e.target.checked}`);
                    setIsCommon(e.target.checked);
                    triggerChange({isCommon: e.target.checked})
                }}>公共</Checkbox>
            </div>

            <TreeSelect disabled={isCommon} {...tProps}/>
        </div>
    );
};

const ScriptOwner: React.FC = () => {
    return (
        <Form.Item
            name="scriptOwner"
            rules={[{required: true, message: '脚本归属不能为空!'}]}
            label="脚本归属"
        >
            <Owner/>
        </Form.Item>
    );
};

export default ScriptOwner;
