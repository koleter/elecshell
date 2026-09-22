import React, {useContext, useEffect, useState, useRef} from "react";
import {Dropdown, Form, Input, message, Modal, Space, Tree, Divider, Button, Tooltip} from "antd";
import {useIntl} from '@@/plugin-locale/localeExports';

const {Search} = Input;

const {DirectoryTree} = Tree;

import "./SessionTransfer.less"
import {sessionIdRef} from "@/pages/Session/main/Main";
import {AppContext} from "@/pages/context/AppContextProvider";
import util, {getUUid, showMessage} from "@/util";
import type {DataNode} from "antd/es/tree";
import { TreeProps} from "antd/es/tree";
import {AimOutlined} from "@ant-design/icons";
import {spiltResponseWithLine} from "@/pages/util/terminal_util";
import SessionTransferProgress from "@/pages/Session/fileTransfer/progress/SessionTransferProgress";
const path = require('path');

const SessionTransfer: React.FC = (props) => {
    const dragWindowRef = useRef<Element>(null);
    const { session } = props;
    const sessionKey = session.key;

    const { activeKey, selectedMenuKey, sessionTransferTreeData, setSessionTransferTreeData } =
        useContext(AppContext);
    // selectedMenuKey == MENU_FILETRANSFER &&
    const [searchValue, setSearchValue] = useState('');

    const [selectedKeys, setSelectedKeys] = useState([]);

    const intl = useIntl();

    function getFileListWithSpcifiedPath(remoteDirectory: string) {
        if (!remoteDirectory.trim()) {
            return;
        }
        sessionIdRef[sessionKey]?.send({
            type: 'exec_worker_method',
            methodName: "get_remote_file_list",
            args: [remoteDirectory]
        })
    }

    function getFileList() {
        getFileListWithSpcifiedPath(searchValue);
    }

    useEffect(() => {
        setSessionTransferTreeData((data) => ({
            ...data,
            [sessionKey]: data[sessionKey] || [],
        }));

        return () => {
            setSessionTransferTreeData((data) => {
                const { [sessionKey]: _, ...rest } = data;
                return rest;
            });
        }
    }, []);

    useEffect(() => {
        const handleDrop = (e) => {
            e.preventDefault();     // 取消默认事件f.path
            e.stopPropagation();    // 阻止冒泡事件
            const fileInfos = [];
            for (const file of e.dataTransfer.files) {
                fileInfos.push({
                    name: file.name,
                    path: file.path
                })
            }
            sessionIdRef[sessionKey]?.send({
                type: 'exec_worker_method',
                methodName: "upload_files",
                args: [fileInfos, searchValue]
            });
        };

        dragWindowRef.current?.addEventListener('drop', handleDrop);

        return () => {
            dragWindowRef.current?.removeEventListener('drop', handleDrop);
        }

    }, [searchValue]);

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
                                sessionIdRef[sessionKey]?.sendRecv('pwd', function (val: string) {
                                    sessionIdRef[sessionKey]?.term.write(
                                        val,
                                        (raw) => {
                                            // console.log(raw);
                                            const lines = spiltResponseWithLine(raw);
                                            for (let i = 0; i < lines.length; i++) {
                                                const line = lines[i];
                                                if (line.startsWith('/')) {
                                                    setSearchValue(line.trimEnd());
                                                    return;
                                                }
                                            }
                                            message.error('can not get pwd, error is ' + val);
                                        },
                                        false,
                                    );
                                });
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
                    <DirectoryTree
                        className={'sftpFileList'}
                        multiple
                        draggable={true}
                        treeData={sessionTransferTreeData[sessionKey]}
                        expandAction={false}
                        selectedKeys={selectedKeys}
                        onSelect={function (
                            selectedKeys,
                            e: { selected: boolean; selectedNodes; node; event },
                        ) {
                            setSelectedKeys(selectedKeys);
                        }}
                        titleRender={(nodeData: DataNode) => {
                            return (
                                <div
                                    key={nodeData.key}
                                    style={{ display: 'inline-block', width: '100%' }}
                                    onDoubleClick={(e) => {
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
                            // console.log(event, node)
                            const fileName = `\.elecshellTransfer_${getUUid()}`;
                            const files = new Set(selectedKeys);
                            files.add(node.key);
                            const prop = {
                                sessionId: sessionKey,
                                files: [...files],
                                remoteDir: searchValue,
                            };
                            const fileContent = JSON.stringify(prop);
                            const file = new Blob([fileContent], { type: 'text/plain' });
                            const url = URL.createObjectURL(file);

                            // 使用 dataTransfer.setData 设置下载链接
                            // event.dataTransfer.setData('text/uri-list', url);
                            event.dataTransfer.setData(
                                'downloadURL',
                                `text/plain:${fileName}:${url}`,
                            );
                            setSelectedKeys([]);
                        }}
                        onDragLeave={({ event, node }) => {
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
                <SessionTransferProgress sessionKey={sessionKey}/>
            </div>
        </>
    );
};

export default React.memo(SessionTransfer);
