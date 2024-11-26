import {EditableProTable, ModalForm} from '@ant-design/pro-components';
import React, {useContext, useState} from 'react';
import util, {getUUid, showMessage} from "@/util";
import {Input, message, Tabs} from 'antd';
import {AppContext} from "@/pages/context/AppContextProvider";
import {useIntl} from '@@/plugin-locale/localeExports';
import {capitalizeFirstLetter} from "@/pages/util/string";

const SettingModal = () => {
    const [modalVisit, setModalVisit] = useState(false);
    const intl = useIntl();

    const columns = [
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
                <Input.Password placeholder="input password" defaultValue={text}/>
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
    ];

    const {
        connectVariable,
        setConnectVariable,
        refreshConfigableGlobalConfig,
        setRefreshConfigableGlobalConfig,
    } = useContext(AppContext);

    electronAPI.ipcRenderer.on('openGlobalSetting', (event, arg) => {
        setModalVisit(true);
    });

    electronAPI.ipcRenderer.on('refreshConfigableGlobalConfig', (event, arg) => {
        setRefreshConfigableGlobalConfig(n => n + 1);
    });

    return <ModalForm
        title={capitalizeFirstLetter(intl.formatMessage({id: "settings"}))}
        open={modalVisit}
        onFinish={async () => {
            const formData = {};
            for (let i = 0; i < connectVariable.length; i++) {
                const item = connectVariable[i];
                if (!item.name) {
                    showMessage({
                        status: "error",
                        content: intl.formatMessage({id: 'Variable name cannot be empty'})
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
              items={[
                  //     {
                  //     key: 'general',
                  //     label: intl.formatMessage({id: 'SettingModal.Setting.general'}),
                  //     children: <></>
                  // },
                  {
                      key: 'variable',
                      label: capitalizeFirstLetter(intl.formatMessage({id: 'variable'})),
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
