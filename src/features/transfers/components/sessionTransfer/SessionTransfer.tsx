import React, { useEffect, useState, useRef } from 'react';
import { Input, message, Tree, Button, Tooltip } from 'antd';
import { useIntl } from '@@/plugin-locale/localeExports';

const { Search } = Input;

const { DirectoryTree } = Tree;

import './SessionTransfer.less';
import { sessionService } from '../../../sessions/services/sessionService';
import { useRemoteFiles, useTransferStore } from '../../model/TransferProvider';
import { getBackendUrl } from '../../../../platform/backend';
import { dragDownloadPayload } from '../../services/transferService';
import type { RemoteFile } from '../../model/transferStore';
import type { TerminalSession } from '../../../sessions/model/types';
import { AimOutlined } from '@ant-design/icons';
import SessionTransferProgress from '@/features/transfers/components/progress/SessionTransferProgress';
const path = require('path');

const SessionTransfer: React.FC<{ session: TerminalSession }> = (props) => {
    const dragWindowRef = useRef<HTMLDivElement>(null);
    const { session } = props;
    const sessionKey = session.key;

    const files = useRemoteFiles(sessionKey);
    const transfers = useTransferStore();
    const [searchValue, setSearchValue] = useState('');

    const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

    // 拖出下载端点的基础地址: dragstart 中必须同步使用, 提前获取并缓存
    const baseUrlRef = useRef('');
    useEffect(() => {
        getBackendUrl().then((url) => {
            baseUrlRef.current = url;
        });
    }, []);

    const intl = useIntl();

    function getFileListWithSpcifiedPath(remoteDirectory: string) {
        if (!remoteDirectory.trim()) {
            return;
        }
        sessionService.listFiles(sessionKey, remoteDirectory);
    }

    function getFileList() {
        getFileListWithSpcifiedPath(searchValue);
    }

    useEffect(() => () => transfers.remove(sessionKey), [transfers, sessionKey]);

    useEffect(() => {
        const handleDrop = (e: DragEvent) => {
            e.preventDefault(); // 取消默认事件f.path
            e.stopPropagation(); // 阻止冒泡事件
            const fileInfos: { name: string; path: string }[] = [];
            for (const file of Array.from(e.dataTransfer!.files)) {
                fileInfos.push({
                    name: file.name,
                    path: (file as File & { path: string }).path,
                });
            }
            sessionService.uploadFiles(sessionKey, fileInfos, searchValue);
        };

        const element = dragWindowRef.current;
        element?.addEventListener('drop', handleDrop);

        return () => {
            element?.removeEventListener('drop', handleDrop);
        };
    }, [searchValue, sessionKey]);

    return (
        <>
            <div className={'sftpFileListSpace'}>
                <div style={{ display: 'flex', flexDirection: 'row' }}>
                    <Search
                        onSearch={getFileList}
                        enterButton
                        value={searchValue}
                        onChange={(e) => {
                            setSearchValue(e.target.value);
                        }}
                    />
                    <Tooltip
                        placement="top"
                        title={intl.formatMessage({ id: 'Aim current directory' })}
                    >
                        <Button
                            icon={<AimOutlined />}
                            onClick={() => {
                                void sessionService
                                    .readWorkingDirectory(sessionKey)
                                    .then(setSearchValue)
                                    .catch((error) => message.error(String(error)));
                            }}
                        />
                    </Tooltip>
                </div>

                <div
                    ref={dragWindowRef}
                    className={'dropDiv'}
                    onDragEnter={(e) => {
                        e.preventDefault();
                    }}
                    onDragOver={(e) => {
                        e.preventDefault();
                    }}
                >
                    <DirectoryTree<RemoteFile>
                        className={'sftpFileList'}
                        multiple
                        draggable={true}
                        treeData={files}
                        expandAction={false}
                        selectedKeys={selectedKeys}
                        onSelect={(keys) => setSelectedKeys(keys)}
                        titleRender={(nodeData: RemoteFile) => {
                            return (
                                <div
                                    key={nodeData.key}
                                    style={{ display: 'inline-block', width: '100%' }}
                                    onDoubleClick={() => {
                                        if (nodeData.isLeaf) {
                                            return;
                                        }
                                        if (nodeData.key == '..') {
                                            const parentDirectory = path.dirname(searchValue);
                                            const normalize = path.normalize(parentDirectory);
                                            setSearchValue(normalize);
                                            getFileListWithSpcifiedPath(normalize);
                                            setSelectedKeys([]);
                                            return;
                                        }
                                        const normalize = path.normalize(
                                            searchValue + '/' + nodeData.title,
                                        );
                                        setSearchValue(normalize);
                                        getFileListWithSpcifiedPath(normalize);
                                        setSelectedKeys([]);
                                    }}
                                >
                                    {nodeData.title}
                                </div>
                            );
                        }}
                        onDragStart={function ({ event, node }) {
                            const selectedFiles = new Set(selectedKeys);
                            selectedFiles.add(node.key);
                            // 指向后端流式下载端点, Chromium 在用户放置文件时才发起请求,
                            // 由后端直接从 SFTP 读取内容流式返回, 放置前零字节传输
                            event.dataTransfer.setData(
                                'downloadURL',
                                dragDownloadPayload(baseUrlRef.current, {
                                    sessionId: sessionKey,
                                    directory: searchValue,
                                    files: [...selectedFiles].map(String),
                                    singleFile: !!node.isLeaf,
                                }),
                            );
                            setSelectedKeys([]);
                        }}
                        onDragLeave={({ event }) => {
                            const nodeElement = event.target;
                            // 创建一个 DragEvent 对象
                            const dragEndEvent = new DragEvent('dragend', {
                                bubbles: true,
                                cancelable: true,
                                view: window,
                                // 你可以在这里添加其他 DragEvent 属性，例如 dataTransfer
                                dataTransfer: new DataTransfer(),
                            });

                            // 分发事件到目标元素
                            nodeElement.dispatchEvent(dragEndEvent);
                        }}
                    />
                </div>
                <SessionTransferProgress sessionKey={sessionKey} />
            </div>
        </>
    );
};

export default React.memo(SessionTransfer);
