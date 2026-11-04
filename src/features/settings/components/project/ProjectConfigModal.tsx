import { settingsService } from '../../services/settingsService';
import { usePrompt } from '../../../dialogs/PromptProvider';
import { useCatalog } from '../../../catalog/model/CatalogProvider';
import { useScripts } from '../../../scripts/model/ScriptsProvider';
import { ProList } from '@ant-design/pro-components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { showMessage } from '@/util';
import { Button, Form, Input, message, Modal, Popconfirm, Radio, Tabs } from 'antd';
import { FormattedMessage, setLocale } from '@@/plugin-locale/localeExports';
import { useSettings } from '../../model/SettingsProvider';
import { desktop } from '../../../../platform/electronBridge';
import { capitalizeFirstLetter } from '@/shared/string';
import { useIntl } from '@@/plugin-locale/localeExports';
import ConnectVariableTable, {
    validateVariables,
} from '@/features/settings/components/variables/ConnectVariableTable';
import './ProjectConfigModal.css';

const IMPORT_NAMESPACE = 'importNamespace';
const EXPORT_NAMESPACE = 'exportNamespace';

const ProjectConfigModal = () => {
    const [modalVisit, setModalVisit] = useState(false);
    const [nameSpaceList, setNameSpaceList] = useState<string[]>([]);
    const [searchValue, setSearchValue] = useState('');
    const intl = useIntl();
    const intlRef = useRef(intl);
    intlRef.current = intl;
    const oldLanguage = useRef('');
    const [language, setLanguage] = useState('en-US');
    const languageRef = useRef(language);
    languageRef.current = language;
    const [curNameSpace, setCurNameSpace] = useState('');

    const prompt = usePrompt();
    const { reloadCatalog } = useCatalog();
    const { reloadScripts } = useScripts();
    const {
        globalConnectVariable,
        setGlobalConnectVariable,
        reloadGlobalVariables,
        reloadProjectVariables,
    } = useSettings();

    const loadAllNameSpace = useCallback(() => {
        settingsService.listNamespaces().then((res) => {
            setNameSpaceList(res);
        });
    }, []);

    useEffect(() => {
        settingsService.loadProject().then((res) => {
            // console.log(res);
            setCurNameSpace(res.data.namespace);
            setLanguage(res?.data?.language || 'en-US');
            setLocale(res?.data?.language || 'en-US', false);
        });
        loadAllNameSpace();

        const handleSwitchLanguage = (_event: unknown, nextLanguage: string) => {
            setLocale(nextLanguage, false);
            setLanguage(nextLanguage);
        };

        const unsubscribehandleSwitchLanguage = desktop.on('switchLanguage', handleSwitchLanguage);

        const handleImportNamespace = (_event: unknown, directoryPath: string) => {
            let title = intlRef.current.formatMessage({ id: 'Please input namespace' });
            prompt(title, (input) => {
                if (!input) {
                    title = intlRef.current.formatMessage({ id: 'namespace cannot be empty' });
                    message.error(title);
                    return;
                }
                settingsService
                    .updateNamespace({
                        type: 'import',
                        namespace: input,
                        directoryPath,
                        force: false,
                    })
                    .then((res) => {
                        loadAllNameSpace();
                        showMessage(res);
                    });
            });
        };

        const unsubscribehandleImportNamespace = desktop.on(
            IMPORT_NAMESPACE,
            handleImportNamespace,
        );

        const handleExportNamespace = (
            _event: unknown,
            arg: { filePath: string; arg: { namespace: string } },
        ) => {
            console.log(arg);
            const filePath = arg.filePath;
            const namespace = arg.arg.namespace;
            settingsService
                .updateNamespace({
                    type: 'export',
                    namespace,
                    directoryPath: filePath,
                })
                .then((res) => {
                    loadAllNameSpace();
                    showMessage(res);
                });
        };

        const unsubscribehandleExportNamespace = desktop.on(
            EXPORT_NAMESPACE,
            handleExportNamespace,
        );

        const handleOpenManagerNameSpaceModal = () => {
            oldLanguage.current = languageRef.current;
            setModalVisit(true);
        };

        const unsubscribehandleOpenManagerNameSpaceModal = desktop.on(
            'openManagerNameSpaceModal',
            handleOpenManagerNameSpaceModal,
        );

        const handleRefreshGlobalVariableConfig = () => {
            reloadGlobalVariables();
        };

        const unsubscribehandleRefreshGlobalVariableConfig = desktop.on(
            'refreshGlobalVariableConfig',
            handleRefreshGlobalVariableConfig,
        );
        // 清理函数，确保在组件卸载时移除事件监听器
        return () => {
            unsubscribehandleSwitchLanguage();
            unsubscribehandleImportNamespace();
            unsubscribehandleExportNamespace();
            unsubscribehandleOpenManagerNameSpaceModal();
            unsubscribehandleRefreshGlobalVariableConfig();
        };
    }, [loadAllNameSpace, prompt, reloadGlobalVariables]);

    // 保存全局变量（跨命名空间共享，workspace 变量未匹配时回退使用）
    function saveGlobalVariable() {
        const error = validateVariables(globalConnectVariable, (id) => intl.formatMessage({ id }));
        if (error) {
            showMessage({
                status: 'error',
                content: error,
            });
            return;
        }
        settingsService.saveVariables('GlobalVariableConfig', globalConnectVariable).then((res) => {
            message[res.status](res.msg);
            if (res.status === 'success') {
                desktop.send('sendAllWindowsIpcMessage', 'refreshGlobalVariableConfig');
            }
        });
    }

    return (
        <>
            <Modal
                title={capitalizeFirstLetter(intl.formatMessage({ id: 'globalConfig' }))}
                width={950}
                open={modalVisit}
                footer={null}
                onCancel={() => {
                    if (oldLanguage.current !== language) {
                        settingsService.saveProject({
                            language,
                        });
                    }
                    setModalVisit(false);
                }}
            >
                <Tabs
                    style={{
                        height: '60vh',
                    }}
                    tabBarGutter={4}
                    tabPosition={'left'}
                    items={[
                        {
                            key: 'namespace',
                            label: capitalizeFirstLetter(intl.formatMessage({ id: 'namespace' })),
                            children: (
                                <ProList
                                    className={'globalconfig-namespace'}
                                    dataSource={nameSpaceList
                                        .filter((namespace) => {
                                            return namespace.indexOf(searchValue) > -1;
                                        })
                                        .map((namespace) => ({ title: namespace, namespace }))}
                                    metas={{
                                        valueType: 'text',
                                        title: {
                                            render: (text, row) => {
                                                if (curNameSpace === row.namespace) {
                                                    return (
                                                        <>
                                                            <span style={{ color: 'red' }}>*</span>
                                                            {row.namespace}
                                                        </>
                                                    );
                                                }
                                                return <span>{row.namespace}</span>;
                                            },
                                        },
                                        actions: {
                                            render: (text, row) => {
                                                const namespace = row.namespace;
                                                const actions = [];
                                                if (curNameSpace !== namespace) {
                                                    actions.push(
                                                        <a
                                                            key="link"
                                                            onClick={() => {
                                                                settingsService
                                                                    .saveProject({
                                                                        namespace: namespace,
                                                                    })
                                                                    .then((res) => {
                                                                        setCurNameSpace(namespace);
                                                                        showMessage(res);
                                                                        // reload xsh, script, global config
                                                                        reloadCatalog();
                                                                        reloadScripts();
                                                                        reloadProjectVariables();
                                                                    });
                                                            }}
                                                        >
                                                            <FormattedMessage id={'switch'} />
                                                        </a>,
                                                    );
                                                }
                                                actions.push(
                                                    <a
                                                        key="export"
                                                        onClick={() => {
                                                            desktop.send('save-directory-dialog', {
                                                                nextChannel: EXPORT_NAMESPACE,
                                                                arg: {
                                                                    namespace,
                                                                },
                                                            });
                                                        }}
                                                    >
                                                        <FormattedMessage id={'export'} />
                                                    </a>,
                                                );

                                                if (curNameSpace !== namespace) {
                                                    actions.push(
                                                        <Popconfirm
                                                            key="delete"
                                                            title={intl.formatMessage({
                                                                id: 'Are you sure you want to delete?',
                                                            })}
                                                            onConfirm={() => {
                                                                settingsService
                                                                    .deleteNamespace(namespace)
                                                                    .then((res) => {
                                                                        if (
                                                                            res.status === 'success'
                                                                        ) {
                                                                            loadAllNameSpace();
                                                                        }
                                                                        showMessage(res);
                                                                    });
                                                            }}
                                                        >
                                                            <a key="view">
                                                                <FormattedMessage id="delete" />
                                                            </a>
                                                        </Popconfirm>,
                                                    );
                                                }
                                                return actions;
                                            },
                                        },
                                    }}
                                    toolBarRender={() => {
                                        return [
                                            <Form.Item
                                                key="search"
                                                label={capitalizeFirstLetter(
                                                    intl.formatMessage({ id: 'search' }),
                                                )}
                                            >
                                                <Input
                                                    style={{ float: 'left' }}
                                                    onChange={(e) => {
                                                        const { value: inputValue } = e.target;
                                                        setSearchValue(inputValue);
                                                    }}
                                                />
                                            </Form.Item>,
                                            <Form.Item key="create">
                                                <Button
                                                    type={'primary'}
                                                    onClick={() => {
                                                        let msg = intl.formatMessage({
                                                            id: 'ProjectConfigModal.namespace.create.prompt',
                                                        });
                                                        prompt(msg, (input) => {
                                                            if (!input) {
                                                                msg = intl.formatMessage({
                                                                    id: 'namespace cannot be empty',
                                                                });
                                                                message.error(msg);
                                                                return;
                                                            }
                                                            settingsService
                                                                .updateNamespace({
                                                                    type: 'create',
                                                                    namespace: input,
                                                                })
                                                                .then((res) => {
                                                                    loadAllNameSpace();
                                                                    showMessage(res);
                                                                });
                                                        });
                                                    }}
                                                >
                                                    {capitalizeFirstLetter(
                                                        intl.formatMessage({ id: 'create' }),
                                                    )}
                                                </Button>
                                            </Form.Item>,
                                            <Form.Item key="create">
                                                <Button
                                                    type={'primary'}
                                                    onClick={async () => {
                                                        desktop.send(
                                                            'selectADirectory',
                                                            IMPORT_NAMESPACE,
                                                        );
                                                    }}
                                                >
                                                    {capitalizeFirstLetter(
                                                        intl.formatMessage({ id: 'import' }),
                                                    )}
                                                </Button>
                                            </Form.Item>,
                                        ];
                                    }}
                                />
                            ),
                        },
                        {
                            key: 'language',
                            label: capitalizeFirstLetter(intl.formatMessage({ id: 'language' })),
                            children: (
                                <>
                                    <FormattedMessage id={'language'} />:{' '}
                                    <Radio.Group
                                        onChange={(e) => {
                                            desktop.send('switchLanguage', e.target.value);
                                        }}
                                        value={language}
                                    >
                                        <Radio value={'en-US'}>English</Radio>
                                        <Radio value={'zh-CN'}>简体中文</Radio>
                                    </Radio.Group>
                                </>
                            ),
                        },
                        {
                            key: 'variable',
                            label: capitalizeFirstLetter(intl.formatMessage({ id: 'variable' })),
                            children: (
                                <>
                                    <ConnectVariableTable
                                        value={globalConnectVariable}
                                        onChange={setGlobalConnectVariable}
                                    />
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'center',
                                            marginTop: 8,
                                        }}
                                    >
                                        <Button type={'primary'} onClick={saveGlobalVariable}>
                                            {capitalizeFirstLetter(
                                                intl.formatMessage({ id: 'save' }),
                                            )}
                                        </Button>
                                    </div>
                                </>
                            ),
                        },
                    ]}
                />
            </Modal>
        </>
    );
};

export default ProjectConfigModal;
