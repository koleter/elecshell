import {ModalForm} from '@ant-design/pro-components';
import React, {useContext, useEffect, useState} from 'react';
import util, {showMessage} from "@/util";
import {message, Tabs} from 'antd';
import {AppContext} from "@/pages/context/AppContextProvider";
import {useIntl} from '@@/plugin-locale/localeExports';
import {capitalizeFirstLetter} from "@/pages/util/string";
import ConnectVariableTable, {validateVariables} from "./ConnectVariableTable";

const SettingModal = () => {
    const [modalVisit, setModalVisit] = useState(false);
    const intl = useIntl();

    const {
        connectVariable,
        setConnectVariable,
        setRefreshConfigableGlobalConfig,
    } = useContext(AppContext);

    useEffect(() => {
        const handleOpenGlobalSetting = (event, arg) => {
            setModalVisit(true);
        };
        electronAPI.ipcRenderer.on('openGlobalSetting', handleOpenGlobalSetting);

        const handleRefreshConfigableGlobalConfig = (event, arg) => {
            setRefreshConfigableGlobalConfig(n => n + 1);
        };
        electronAPI.ipcRenderer.on('refreshConfigableGlobalConfig', handleRefreshConfigableGlobalConfig);

        return () => {
            electronAPI.ipcRenderer.removeListener('openGlobalSetting', handleOpenGlobalSetting);
            electronAPI.ipcRenderer.removeListener('refreshConfigableGlobalConfig', handleRefreshConfigableGlobalConfig);
        }
    }, []);

    return <ModalForm
        title={capitalizeFirstLetter(intl.formatMessage({id: "settings"}))}
        open={modalVisit}
        onFinish={async () => {
            const error = validateVariables(connectVariable, intl.formatMessage);
            if (error) {
                showMessage({
                    status: "error",
                    content: error
                });
                return;
            }
            util.request('conf', {
                method: 'POST',
                body: JSON.stringify({
                    type: 'ConfigableProjectConfig',
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
                      children: <ConnectVariableTable value={connectVariable} onChange={setConnectVariable}/>
                  }]}
        />
    </ModalForm>
}

export default SettingModal;
