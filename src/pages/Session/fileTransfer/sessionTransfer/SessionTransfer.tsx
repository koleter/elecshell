import React, {useContext, useEffect, useState, useRef} from "react";
import {Dropdown, Form, Input, message, Modal, Space, Tree, Divider, Button} from "antd";

const {Search} = Input;

const {DirectoryTree} = Tree;

import "./SessionTransfer.less"
import {sessionIdRef, sessionInit} from "@/pages/Session/main/Main";
import {AppContext} from "@/pages/context/AppContextProvider";
import util, {getUUid} from "@/util";
import {DataNode, TreeProps} from "antd/es/tree";
import {HEADER_HEIGHT, MENU_FILETRANSFER} from "@/const";
import {AimOutlined} from "@ant-design/icons";
import {spiltResponseWithLine} from "@/pages/util/terminal_util";
const path = require('path');

const SessionTransfer: React.FC = (props) => {
    const {session} = props;
    const [treeData, setTreeData] = useState([]);

    const dragWindowRef = useRef(null);

    const {activeKey, selectedMenuKey} = useContext(AppContext);
    // selectedMenuKey == MENU_FILETRANSFER &&
    const [searchValue, setSearchValue] = useState('');

    const [selectedKeys, setSelectedKeys] = useState([]);

    function getFileListWithSpcifiedPath(remoteDirectory: string) {
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
                    console.log(result)
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

    function dirWinHeightStyleStr() {
        if (process.platform === 'darwin') {
            return `calc(100vh - 50px - ${HEADER_HEIGHT}px)`;
        }
        return `calc(100vh - 50px)`;
    }

    return <>
        <Space className={'sftpFileListSpace'} direction="vertical" size="middle">
            <div style={{display: "flex", flexDirection: "row"}}>
                <Search placeholder="input search text" onSearch={getFileList} enterButton value={searchValue}
                        onChange={(e) => {
                            setSearchValue(e.target.value);
                        }}/>
                <Button icon={<AimOutlined />} onClick={() => {
                    sessionIdRef[activeKey]?.sendRecv('pwd', function (val: string) {
                        console.log(val);
                        const lines = spiltResponseWithLine(val);
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i];
                            if (line.startsWith("/")) {
                                setSearchValue(line.trimEnd());
                                return;
                            }
                        }
                        message.error('can not get pwd, error is ' + val);
                    })
                }}></Button>
            </div>

            <div ref={dragWindowRef} className={'dropDiv'}
                 onDragEnter={(e) => {e.preventDefault()}}
                 onDragOver={(e) => {e.preventDefault()}}
            >
                <DirectoryTree
                    className={'sftpFileList'}
                    style={{height: dirWinHeightStyleStr()}}
                    multiple
                    draggable={true}
                    treeData={treeData}
                    expandAction={false}
                    selectedKeys={selectedKeys}
                    onSelect={function(selectedKeys, e:{selected: boolean, selectedNodes, node, event}) {
                        setSelectedKeys(selectedKeys);
                    }}
                    titleRender={(nodeData: DataNode) => {
                        return <div style={{display: 'inline-block', width: '100%'}} onDoubleClick={(e) => {
                            if (nodeData.isLeaf) {
                                return;
                            }
                            if (nodeData.key == "..") {
                                const parentDirectory = path.dirname(searchValue);
                                const normalize = path.normalize(parentDirectory);
                                setSearchValue(normalize);
                                getFileListWithSpcifiedPath(normalize);
                                return;
                            }
                            const normalize = path.normalize(searchValue + "/" + nodeData.title);
                            setSearchValue(normalize);
                            getFileListWithSpcifiedPath(normalize);
                        }}>
                            {nodeData.title}
                        </div>
                    }}
                    onDragStart={function ({event, node}) {
                        console.log(event, node)
                        const fileName = `elecshellTransfer_${getUUid()}`;
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
                    }}
                />
            </div>
        </Space>
    </>
};

export default React.memo(SessionTransfer);
