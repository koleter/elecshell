import React, {useState, useContext} from 'react';
import {Form, TreeSelect, Checkbox} from 'antd';
import {AppContext} from "@/pages/context/AppContextProvider";


const Owner: React.FC = ({value = {}, onChange}) => {
    const [isCommon, setIsCommon] = useState(false);
    const [owners, setOwners] = useState([]);

    const {treeData, activeKey} = useContext(AppContext);

    const triggerChange = (changedValue) => {
        onChange?.({isCommon, owners, ...value, ...changedValue});
    };

    const tProps = {
        treeData: treeData && treeData[0]?.children || [],
        onChange: function (value, label, extra) {
            console.log(value, label, extra);
            // setOwners(value);
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
        // value: owners
    };

    return (
        <>
            <Checkbox onChange={(e) => {
                console.log(`checked = ${e.target.checked}`);
                setIsCommon(e.target.checked);
                triggerChange({isCommon})
            }}>公共</Checkbox>
            <TreeSelect disabled={isCommon} {...tProps}/>
        </>
    );
};

const ScriptOwner: React.FC = () => {

    return (
        <Form.Item
            initialValue={{
                isCommon: false,
                owners: [],
            }}
            name="scriptOwner"
            rules={[{required: true, message: '脚本归属不能为空!'}]}
            label="脚本归属"
        >
            <Owner/>
        </Form.Item>
    );
};

export default ScriptOwner;
