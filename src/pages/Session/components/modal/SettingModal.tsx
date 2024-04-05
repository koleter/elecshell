import {
    ModalForm,
    EditableProTable
} from '@ant-design/pro-components';
import { useState, useEffect } from 'react';
import util, {getUUid, showMessage} from "@/util";
import {request} from "@@/plugin-request/request";
import {message} from 'antd';

const columns = [
    {
        title: '变量名',
        dataIndex: 'name'
    },
    {
        title: '变量值',
        dataIndex: 'value'
    },
    {
        title: '操作',
        valueType: 'option',
        width: 50,
        render: () => {
            return null;
        },
    },
];

const SettingModal = () => {
    const [modalVisit, setModalVisit] = useState(false);
    const [dataSource, setDataSource] = useState([]);
    const [refresh, setRefresh] = useState(0);

    useEffect(() => {
        request(util.baseUrl + 'conf', {
            method: 'GET',
            params: {
                type: 'ConfigableGlobalConfig',
            }
        }).then(res => {
            console.log(res);
            if (res.status == 'success') {
                setDataSource(res?.data?.strVariableSetting || []);
            } else {
                message[res.status](res.msg);
            }
        })
    }, [refresh])

    electronAPI.ipcRenderer.on('openGlobalSetting', (event, arg) => {
        setModalVisit(true);
    });

    return <ModalForm
        title="设置"
        open={modalVisit}
        onFinish={async () => {
            const formData = {};
            for (let i = 0; i < dataSource.length; i++) {
                const item = dataSource[i];
                if (!item.name) {
                    showMessage({
                        status: "error",
                        content: "变量名不能为空"
                    });
                    return;
                }
                formData[item.name] = item;
            }
            if (Object.keys(formData).length != dataSource.length) {
                // has repeat data, this is not allowed
                const counter = {}
                for (let i = 0; i < dataSource.length; i++) {
                    counter[dataSource[i].name]++;
                }
                const result = []
                for (let key in counter) {
                    if (counter[key] != 1) {
                        result.push(key);
                    }
                }
                showMessage({
                    status: "error",
                    content: "exist same name: " + result.join(",")
                })
                return;
            }
            request(util.baseUrl + 'conf', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'ConfigableGlobalConfig',
                    args: {
                        strVariableSetting: dataSource
                    }
                })
            })
            return true;
        }}
        onOpenChange={setModalVisit}
    >
        <EditableProTable
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
    </ModalForm>
}

export default SettingModal;
