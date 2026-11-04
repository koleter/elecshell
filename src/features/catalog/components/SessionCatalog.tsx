import React, { useState } from 'react';
import { Form, Input, message, Modal } from 'antd';
import type { TreeProps } from 'antd/es/tree';
import type { MenuProps } from 'antd';
import type { LoginScriptStep, SessionConfiguration, SessionTreeNode } from '../model/types';
import { useCatalog } from '../model/CatalogProvider';
import { catalogService } from '../services/catalogService';
import { useShell } from '../../settings/model/ShellProvider';
import { usePrompt } from '../../dialogs/PromptProvider';
import { useWorkspaceCommands } from '../../workspace/model/WorkspaceProvider';
import { sessionService } from '../../sessions/services/sessionService';
import SessionEditor from './SessionEditor';
import SessionTree from './SessionTree';
import './SessionList.less';
import { NENU_SESSIONS } from '@/const';
import { fileSep } from '@/shared/path';
import { FormattedMessage, useIntl } from '@@/plugin-locale/localeExports';
import { capitalizeFirstLetter } from '@/shared/string';

const defaultSessionPropertyActiveKey = 'baseInfo';

const SessionCatalog: React.FC = () => {
    const commands = useWorkspaceCommands();
    const [form] = Form.useForm<SessionConfiguration>();
    const [modalNode, setModalNode] = useState<SessionTreeNode | null>(null);
    const [addSessionModalVisiable, setAddSessionModalVisiable] = useState(false);
    const [editForm] = Form.useForm<SessionConfiguration>();
    const [editSessionModalVisiable, setEditSessionModalVisiable] = useState(false);
    const [dataSource, setDataSource] = useState<LoginScriptStep[]>([]);
    const [sessionPropertyActiveKey, setSessionPropertyActiveKey] = useState(
        defaultSessionPropertyActiveKey,
    );
    const intl = useIntl();

    const prompt = usePrompt();
    const { treeData, sessionRootKey, reloadCatalog } = useCatalog();
    const { selectedMenuKey } = useShell();

    function calcSessionPropertyModalWidth() {
        switch (sessionPropertyActiveKey) {
            case 'baseInfo':
            case 'loginScript':
                return '75vw';
            default:
                throw new Error('unexpect active key: ' + sessionPropertyActiveKey);
        }
    }

    const createNewSession = (node: SessionTreeNode) => {
        void sessionService
            .open(
                { sessionConfId: node.key, filePath: node.path || '', sessionName: node.title },
                commands,
                node.encoding,
            )
            .catch((error) => message.error(String(error)));
    };

    const genTreeNodeMenu = (node: SessionTreeNode): MenuProps => {
        const items: MenuProps['items'] = [];
        // 非session节点
        if (!node.isLeaf) {
            items.push({
                label: capitalizeFirstLetter(intl.formatMessage({ id: 'new' })),
                key: 'new',
                children: [
                    {
                        label: (
                            <div
                                onClick={() => {
                                    prompt(
                                        intl.formatMessage({ id: 'Please enter a folder name' }),
                                        function (dirName) {
                                            if (!dirName) {
                                                return;
                                            }
                                            catalogService
                                                .update({
                                                    type: 'createDir',
                                                    path: node.path
                                                        ? node.path + '/' + dirName
                                                        : dirName,
                                                })
                                                .then((res) => {
                                                    message[res.status](res.msg);
                                                    if (res.status == 'success') {
                                                        reloadCatalog();
                                                    }
                                                });
                                        },
                                    );
                                }}
                            >
                                <FormattedMessage id={'folder'} />
                            </div>
                        ),
                        key: 'addFolder',
                    },
                    {
                        label: (
                            <div
                                onClick={() => {
                                    form.resetFields();
                                    setDataSource([]);
                                    setModalNode(node);
                                    setAddSessionModalVisiable(true);
                                }}
                            >
                                <FormattedMessage id={'session'} />
                            </div>
                        ),
                        key: 'addSession',
                    },
                ],
            });
        }

        // 非root节点
        if (sessionRootKey != node.key) {
            // 复制文件夹或者某个session文件
            items.push({
                label: (
                    <div
                        onClick={() => {
                            catalogService
                                .update({
                                    type: 'duplicate',
                                    path: node.path || '',
                                })
                                .then((res) => {
                                    message[res.status](res.msg);
                                    if (res.status == 'success') {
                                        reloadCatalog();
                                    }
                                });
                        }}
                    >
                        <FormattedMessage id={'copy'} />
                    </div>
                ),
                key: 'duplicateSession',
            });

            items.push(
                {
                    label: (
                        <div
                            onClick={() => {
                                setModalNode(node);
                                if (node.isLeaf) {
                                    catalogService
                                        .update({
                                            type: 'readFile',
                                            path: node.path || '',
                                        })
                                        .then((res) => {
                                            if (res.status !== 'success') {
                                                message[res.status](res.msg);
                                            } else {
                                                const sessionInfo = JSON.parse(
                                                    res.content || '{}',
                                                ) as SessionConfiguration;
                                                // console.log(sessionInfo)
                                                setDataSource(sessionInfo.login_script || []);
                                                editForm.setFieldsValue(
                                                    Object.assign({ key: node.key }, sessionInfo),
                                                );
                                                setEditSessionModalVisiable(true);
                                            }
                                        });
                                } else {
                                    editForm.setFieldsValue(node);
                                    setEditSessionModalVisiable(true);
                                }
                            }}
                        >
                            <FormattedMessage id={'edit'} />
                        </div>
                    ),
                    key: 'edit',
                },
                {
                    label: (
                        <div
                            onClick={() => {
                                catalogService
                                    .update({
                                        type: 'deleteFile',
                                        path: node.path || '',
                                    })
                                    .then((res) => {
                                        message[res.status](res.msg);
                                        if (res.status == 'success') {
                                            reloadCatalog();
                                        }
                                    });
                            }}
                        >
                            <FormattedMessage id={'delete'} />
                        </div>
                    ),
                    key: 'delete',
                },
            );
        }

        return { items };
    };

    function moveFile(dragKey: string, dropKey: string) {
        catalogService
            .update({
                type: 'moveFileOrDir',
                src: dragKey,
                dst: dropKey,
            })
            .then((res) => {
                message[res.status](res.msg);
                if (res.status == 'success') {
                    reloadCatalog();
                }
            });
    }

    const onDrop: TreeProps<SessionTreeNode>['onDrop'] = (info) => {
        // console.log(info, "path.sep: " + fileSep());
        const dropKey = info.node.path || '';
        const dragKey = info.dragNode.path || '';
        let srcDir = dragKey;
        if (info.dragNode.isLeaf) {
            srcDir = dragKey.substr(0, dragKey.lastIndexOf(fileSep()));
            console.log('srcDir: ', srcDir);
        }
        let dstDir = dropKey;
        if (info.node.isLeaf) {
            dstDir = dropKey.substr(0, dropKey.lastIndexOf(fileSep()));
            console.log('dstDir: ', dstDir);
        }
        // console.log(info.node, info.dragNode)
        if (srcDir == dstDir) {
            return;
        }
        moveFile(dragKey, dropKey);
    };

    function commonSessionModalClose() {
        setSessionPropertyActiveKey(defaultSessionPropertyActiveKey);
    }

    return (
        <div>
            <SessionTree
                treeData={treeData}
                visible={selectedMenuKey === NENU_SESSIONS}
                getMenu={genTreeNodeMenu}
                onOpen={createNewSession}
                onDrop={onDrop}
            />

            <Modal
                width={calcSessionPropertyModalWidth()}
                maskClosable={false}
                open={editSessionModalVisiable}
                closable={false}
                onOk={() => {
                    editForm.submit();
                }}
                onCancel={() => {
                    setEditSessionModalVisiable(false);
                    commonSessionModalClose();
                }}
            >
                <Form
                    form={editForm}
                    onFinish={(formInfo) => {
                        // console.log(formInfo)
                        if (!modalNode) return;
                        if (!modalNode.isLeaf) {
                            catalogService
                                .update({
                                    type: 'renameDir',
                                    src: modalNode.path || '',
                                    dst: formInfo.title || '',
                                })
                                .then((res) => {
                                    message[res.status](res.msg);
                                    if (res.status == 'success') {
                                        reloadCatalog();
                                        setEditSessionModalVisiable(false);
                                    }
                                });
                            return;
                        }
                        formInfo.login_script = dataSource || [];
                        if (typeof formInfo.privatekey != 'string') {
                            formInfo.privatekey = formInfo.filePath;
                        }
                        catalogService
                            .update({
                                type: 'editSession',
                                src: modalNode.path || '',
                                sessionInfo: formInfo,
                            })
                            .then((res) => {
                                message[res.status](res.msg);
                                if (res.status == 'success') {
                                    reloadCatalog();
                                    setEditSessionModalVisiable(false);
                                }
                            });
                    }}
                >
                    {
                        <>
                            {modalNode?.isLeaf ? (
                                <>
                                    <SessionEditor
                                        mode="edit"
                                        dataSource={dataSource}
                                        setDataSource={setDataSource}
                                        sessionPropertyActiveKey={sessionPropertyActiveKey}
                                        setSessionPropertyActiveKey={setSessionPropertyActiveKey}
                                    />
                                </>
                            ) : (
                                <Form.Item
                                    label="文件夹名"
                                    name="title"
                                    initialValue={modalNode?.title}
                                    rules={[{ required: true, message: '请输入文件夹名!' }]}
                                >
                                    <Input />
                                </Form.Item>
                            )}
                        </>
                    }
                </Form>
            </Modal>
            <Modal
                width={calcSessionPropertyModalWidth()}
                maskClosable={false}
                open={addSessionModalVisiable}
                closable={false}
                onOk={() => {
                    form.submit();
                }}
                onCancel={() => {
                    setAddSessionModalVisiable(false);
                    commonSessionModalClose();
                }}
            >
                <Form
                    form={form}
                    onFinish={(formInfo) => {
                        if (!modalNode) return;
                        formInfo.login_script = dataSource || [];
                        catalogService
                            .update({
                                type: 'addFile',
                                dir: modalNode.path || '',
                                fileName: formInfo.sessionName || '',
                                content: JSON.stringify(formInfo),
                            })
                            .then((res) => {
                                message[res.status](res.msg);
                                if (res.status == 'success') {
                                    reloadCatalog();
                                    setAddSessionModalVisiable(false);
                                }
                            });
                    }}
                >
                    <SessionEditor
                        mode="create"
                        dataSource={dataSource}
                        setDataSource={setDataSource}
                        sessionPropertyActiveKey={sessionPropertyActiveKey}
                        setSessionPropertyActiveKey={setSessionPropertyActiveKey}
                    />
                </Form>
            </Modal>
        </div>
    );
};

export default React.memo(SessionCatalog);
