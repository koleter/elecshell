import React, {useContext, useEffect, useState, useRef} from "react";
import {Dropdown, Form, Input, message, Modal, Space, Tree, Divider, Button, Tooltip} from "antd";
import {useIntl} from '@@/plugin-locale/localeExports';

const {Search} = Input;

const {DirectoryTree} = Tree;

import "./SessionTransfer.less"
import {sessionIdRef, sessionInit} from "@/pages/Session/main/Main";
import {AppContext} from "@/pages/context/AppContextProvider";
import util, {getUUid, showMessage} from "@/util";
import {DataNode, TreeProps} from "antd/es/tree";
import {AimOutlined} from "@ant-design/icons";
import {spiltResponseWithLine} from "@/pages/util/terminal_util";
import SessionTransferProgress from "@/pages/Session/fileTransfer/progress/SessionTransferProgress";
const path = require('path');

const SessionTransfer: React.FC = (props) => {
    const {session} = props;
    const [treeData, setTreeData] = useState([]);

    const dragWindowRef = useRef<Element>(null);

    const {activeKey, selectedMenuKey} = useContext(AppContext);
    // selectedMenuKey == MENU_FILETRANSFER &&
    const [searchValue, setSearchValue] = useState('');

    const [selectedKeys, setSelectedKeys] = useState([]);

    const intl = useIntl();

    function getFileListWithSpcifiedPath(remoteDirectory: string) {
        if (!remoteDirectory.trim()) {
            return;
        }
        sessionIdRef[activeKey]?.send({
            type: 'exec_worker_method',
            methodName: "get_remote_file_list",
            args: [remoteDirectory]
        })
    }

    function getFileList() {
        getFileListWithSpcifiedPath(searchValue);
    }

    useEffect(() => {
        if (!sessionInit[session.key]) {
            sessionInit[session.key] = [];
        }

        sessionInit[session.key].push(() => {
            if (sessionIdRef[activeKey]) {
                sessionIdRef[activeKey].refreshRemoteFileList = (result) => {
                    // console.log(result);
                    result.unshift({
                        title: "..",
                        key: "..",
                        isLeaf: false,
                        remoteDirectory: searchValue
                    });
                    setTreeData(result);
                };
            }
        });
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
            sessionIdRef[activeKey]?.send({
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

    return <>
        <div className={'sftpFileListSpace'}>
            <div style={{display: "flex", flexDirection: "row"}}>
                <Search onSearch={getFileList} enterButton value={searchValue}
                        onChange={(e) => {
                            setSearchValue(e.target.value);
                        }}/>
                <Tooltip placement="top" title={intl.formatMessage({id: "Aim current directory"})}>
                    <Button icon={<AimOutlined />} onClick={() => {
                        sessionIdRef[activeKey]?.sendRecv('pwd', function (val: string) {
                            sessionIdRef[activeKey]?.term.write(val, (raw) => {
                                // console.log(raw);
                                const lines = spiltResponseWithLine(raw);
                                for (let i = 0; i < lines.length; i++) {
                                    const line = lines[i];
                                    if (line.startsWith("/")) {
                                        setSearchValue(line.trimEnd());
                                        return;
                                    }
                                }
                                message.error('can not get pwd, error is ' + val);
                            }, false);
                        })
                    }}></Button>
                </Tooltip>

            </div>

            <div ref={dragWindowRef} className={'dropDiv'}
                 onDragEnter={(e) => {e.preventDefault()}}
                 onDragOver={(e) => {e.preventDefault()}}
            >
                <DirectoryTree
                    className={'sftpFileList'}
                    multiple
                    draggable={true}
                    treeData={treeData}
                    expandAction={false}
                    selectedKeys={selectedKeys}
                    onSelect={function(selectedKeys, e:{selected: boolean, selectedNodes, node, event}) {
                        setSelectedKeys(selectedKeys);
                    }}
                    titleRender={(nodeData: DataNode) => {
                        return <div key={nodeData.key} style={{display: 'inline-block', width: '100%'}} onDoubleClick={(e) => {
                            if (nodeData.isLeaf) {
                                return;
                            }
                            if (nodeData.key == "..") {
                                const parentDirectory = path.dirname(searchValue);
                                const normalize = path.normalize(parentDirectory);
                                setSearchValue(normalize);
                                getFileListWithSpcifiedPath(normalize);
                                setSelectedKeys([]);
                                return;
                            }
                            const normalize = path.normalize(searchValue + "/" + nodeData.title);
                            setSearchValue(normalize);
                            getFileListWithSpcifiedPath(normalize);
                            setSelectedKeys([]);
                        }}>
                            {nodeData.title}
                        </div>
                    }}
                    onDragStart={function ({event, node}) {
                        // console.log(event, node)
                        const fileName = `\.elecshellTransfer_${getUUid()}`;
                        const files = new Set(selectedKeys);
                        files.add(node.key);
                        const prop = {
                            sessionId: activeKey,
                            files: [...files],
                            remoteDir: searchValue,
                        };
                        const fileContent = JSON.stringify(prop);
                        const file = new Blob([fileContent], {type: 'text/plain'});
                        const url = URL.createObjectURL(file);

                        // 使用 dataTransfer.setData 设置下载链接
                        // event.dataTransfer.setData('text/uri-list', url);
                        event.dataTransfer.setData('downloadURL', `text/plain:${fileName}:${url}`);
                        setSelectedKeys([]);
                    }}
                    onDragLeave={({event, node}) => {
                        const nodeElement = event.target;
                        // 创建一个 DragEvent 对象
                        const dragEndEvent = new DragEvent('dragend', {
                            bubbles: true,
                            cancelable: true,
                            view: window,
                            // 你可以在这里添加其他 DragEvent 属性，例如 dataTransfer
                            dataTransfer: new DataTransfer()
                        });

                        // 分发事件到目标元素
                        nodeElement.dispatchEvent(dragEndEvent);
                    }}
                />
            </div>
            <SessionTransferProgress session={session}></SessionTransferProgress>
        </div>
    </>
};

export default React.memo(SessionTransfer);
