import {
    ModalForm,
    EditableProTable
} from '@ant-design/pro-components';
import React, { useState, useEffect } from 'react';
import util, {getUUid, showMessage} from "@/util";
import {request} from "@@/plugin-request/request";
import {message, Input, Tabs, Select, Space} from 'antd';

const columns = [
    {
        title: '变量名',
        dataIndex: 'name'
    },
    {
        title: '变量值',
        renderFormItem: (_, { isEditable }) => {
            return <Input.Password />;
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
    const [dataSource, setDataSource] = useState([]);
    const [refresh, setRefresh] = useState(0);

    const [nameSpaceOptions, setNameSpaceOptions] = useState([]);

    useEffect(() => {
        util.request('query_namespace', {
            method: 'GET',
        }).then(res => {
            setNameSpaceOptions(res);
        })
    }, [])

    useEffect(() => {
        util.request('conf', {
            method: 'GET',
            params: {
                type: 'ConfigableGlobalConfig',
            }
        }).then(res => {
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

    electronAPI.ipcRenderer.on('refreshConfigableGlobalConfig', (event, arg) => {
        setRefresh(n => n + 1);
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
            util.request('conf', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'ConfigableGlobalConfig',
                    args: {
                        strVariableSetting: dataSource
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
                  key: 'connectVariable',
                  label: '连接变量',
                  children: <EditableProTable
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
              }, {
                  key: 'namespace',
                  label: '命名空间',
                  children: <Select
                      style={{ width: '100%' }}
                      placeholder="select one namespace"
                      defaultValue={['default']}
                      onChange={(value, option) => {
                          console.log(value, option);
                      }}
                      options={nameSpaceOptions}
                      // optionRender={(option) => (
                      //     <Space>
                      //       <span role="img" aria-label={option.data.label}>
                      //         {option.data.emoji}
                      //       </span>
                      //         {option.data.desc}
                      //     </Space>
                      // )}
                  />
              }]}
        />
    </ModalForm>
}

export default SettingModal;
