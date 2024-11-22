import {
    ModalForm,
    EditableProTable
} from '@ant-design/pro-components';
import React, {useState, useEffect, useContext} from 'react';
import util, {getUUid, showMessage} from "@/util";
import {request} from "@@/plugin-request/request";
import {message, Input, Tabs, Select, Form, Button} from 'antd';
import {FormattedMessage} from "@@/plugin-locale/localeExports";
import {AppContext} from "@/pages/context/AppContextProvider";

const columns = [
    {
        title: '变量名',
        dataIndex: 'name'
    },
    {
        title: '变量值',
        renderFormItem: (_, {isEditable}) => {
            return <Input.Password/>;
        },
        render: (text, record, _, action) => [
            <Input.Password placeholder="input password" defaultValue={text}/>
        ],
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

    const {
        connectVariable, setConnectVariable, refreshConfigableGlobalConfig, setRefreshConfigableGlobalConfig
    } = useContext(AppContext);

    electronAPI.ipcRenderer.on('openGlobalSetting', (event, arg) => {
        setModalVisit(true);
    });

    electronAPI.ipcRenderer.on('refreshConfigableGlobalConfig', (event, arg) => {
        setRefreshConfigableGlobalConfig(n => n + 1);
    });

    return <ModalForm
        title="设置"
        open={modalVisit}
        onFinish={async () => {
            const formData = {};
            for (let i = 0; i < connectVariable.length; i++) {
                const item = connectVariable[i];
                if (!item.name) {
                    showMessage({
                        status: "error",
                        content: "变量名不能为空"
                    });
                    return;
                }
                formData[item.name] = item;
            }
            if (Object.keys(formData).length != connectVariable.length) {
                // has repeat data, this is not allowed
                const counter = {}
                for (let i = 0; i < connectVariable.length; i++) {
                    counter[connectVariable[i].name]++;
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
            util.request('conf', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'ConfigableGlobalConfig',
                    args: {
                        strVariableSetting: connectVariable
                    }
                })
            }).then(res => {
                message[res.status](res.msg);
                if (res.status === 'success') {
                    electronAPI.ipcRenderer.send('sendAllWindowsIpcMessage', 'refreshConfigableGlobalConfig');
                }
            })
            return true;
        }}
        onOpenChange={setModalVisit}
    >
        <Tabs style={{
            height: "60vh"
        }}
              tabBarGutter={4}
              tabPosition={'left'}
              items={[{
                  key: 'base',
                  label: '基本配置',
                  children: <>

                  </>
              }, {
                  key: 'connectVariable',
                  label: '连接变量',
                  children: <EditableProTable
                      columns={columns}
                      rowKey="id"
                      value={connectVariable}
                      onChange={setConnectVariable}
                      recordCreatorProps={{
                          newRecordType: 'dataSource',
                          record: () => ({
                              id: getUUid(),
                          }),
                      }}
                      editable={{
                          type: 'multiple',
                          editableKeys: connectVariable.map(item => item.id),
                          actionRender: (row, config, defaultDoms) => {
                              return [defaultDoms.delete];
                          },
                          onValuesChange: (record, recordList) => {
                              setConnectVariable(recordList);
                          },
                      }}
                  />
              }]}
        />
    </ModalForm>
}

export default SettingModal;
