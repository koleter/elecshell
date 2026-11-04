import { settingsService } from '../../services/settingsService';
import { ModalForm } from '@ant-design/pro-components';
import { useEffect, useState } from 'react';
import { showMessage } from '@/util';
import { message, Tabs } from 'antd';
import { useSettings } from '../../model/SettingsProvider';
import { desktop } from '../../../../platform/electronBridge';
import { useIntl } from '@@/plugin-locale/localeExports';
import { capitalizeFirstLetter } from '@/shared/string';
import ConnectVariableTable, { validateVariables } from './ConnectVariableTable';

const SettingModal = () => {
    const [modalVisit, setModalVisit] = useState(false);
    const intl = useIntl();

    const { connectVariable, setConnectVariable, reloadProjectVariables } = useSettings();

    useEffect(() => {
        const handleOpenGlobalSetting = () => {
            setModalVisit(true);
        };
        const unsubscribehandleOpenGlobalSetting = desktop.on(
            'openGlobalSetting',
            handleOpenGlobalSetting,
        );

        const handleRefreshConfigableGlobalConfig = () => {
            reloadProjectVariables();
        };
        const unsubscribehandleRefreshConfigableGlobalConfig = desktop.on(
            'refreshConfigableGlobalConfig',
            handleRefreshConfigableGlobalConfig,
        );

        return () => {
            unsubscribehandleOpenGlobalSetting();
            unsubscribehandleRefreshConfigableGlobalConfig();
        };
    }, [reloadProjectVariables]);

    return (
        <ModalForm
            title={capitalizeFirstLetter(intl.formatMessage({ id: 'settings' }))}
            open={modalVisit}
            onFinish={async () => {
                const error = validateVariables(connectVariable, (id) =>
                    intl.formatMessage({ id }),
                );
                if (error) {
                    showMessage({
                        status: 'error',
                        content: error,
                    });
                    return;
                }
                settingsService
                    .saveVariables('ConfigableProjectConfig', connectVariable)
                    .then((res) => {
                        message[res.status](res.msg);
                        if (res.status === 'success') {
                            desktop.send(
                                'sendAllWindowsIpcMessage',
                                'refreshConfigableGlobalConfig',
                            );
                        }
                    });
                return true;
            }}
            onOpenChange={setModalVisit}
        >
            <Tabs
                style={{
                    height: '60vh',
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
                        label: capitalizeFirstLetter(intl.formatMessage({ id: 'variable' })),
                        children: (
                            <ConnectVariableTable
                                value={connectVariable}
                                onChange={setConnectVariable}
                            />
                        ),
                    },
                ]}
            />
        </ModalForm>
    );
};

export default SettingModal;
