import React, {useContext, useEffect, useState, useRef} from "react";
import {Dropdown, Form, Input, message, Modal, Space, Tree, Divider} from "antd";

const {Search} = Input;

const {DirectoryTree} = Tree;

import "./SessionTransfer.less"
import {sessionIdRef} from "@/pages/Session/main/Main";
import {AppContext} from "@/pages/context/AppContextProvider";
import util, {getUUid} from "@/util";
import {DataNode, TreeProps} from "antd/es/tree";
const path = require('path');

const SessionTransfer: React.FC = (props) => {
    const [treeData, setTreeData] = useState([]);

    const dragWindowRef = useRef(null);

    const {activeKey} = useContext(AppContext);

    const [searchValue, setSearchValue] = useState('/');

    const [selectedKeys, setSelectedKeys] = useState([]);

    function getFileListWithSpcifiedPath(remoteDirectory: string) {
        sessionIdRef[activeKey]?.send({
            type: 'exec_worker_method',
            methodName: "get_remote_file_list",
            args: [remoteDirectory]
        })
    }

    function getFileList(param) {
        getFileListWithSpcifiedPath(searchValue);
    }

    useEffect(() => {
        sessionIdRef[activeKey].refreshRemoteFileList = (result) => {
            result.unshift({
                title: "..",
                key: "..",
                isLeaf: false,
                remoteDirectory: searchValue
            });
            setTreeData(result);
        };

        getFileList();

        dragWindowRef.current && dragWindowRef.current.addEventListener('drop', (e) => {
            e.preventDefault();     // 取消默认事件f.path
            e.stopPropagation();    // 阻止冒泡事件
            console.log(e.dataTransfer.files)
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
        })
    }, []);

    return <>
        <Space direction="vertical" size="middle" style={{display: 'flex', overflow: 'auto'}}>
            <Search placeholder="input search text" onSearch={getFileList} enterButton value={searchValue}
                    onChange={(e) => {
                        // console.log(e);
                        setSearchValue(e.target.value);
                    }}/>

            <div ref={dragWindowRef}>
                <DirectoryTree
                    className={'sftpFileList'}
                    multiple
                    draggable={true}
                    treeData={treeData}
                    expandAction={false}
                    selectedKeys={selectedKeys}
                    onSelect={function(selectedKeys, e:{selected: boolean, selectedNodes, node, event}) {
                        console.log(selectedKeys, e)
                        setSelectedKeys(selectedKeys);
                    }}
                    titleRender={(nodeData: DataNode) => {
                        return <div style={{display: 'inline-block', width: '100%'}} onDoubleClick={(e) => {
                            if (nodeData.isLeaf) {
                                return;
                            }
                            if (nodeData.key == "..") {
                                const parentDirectory = path.dirname(nodeData.remoteDirectory);
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

export default SessionTransfer;
