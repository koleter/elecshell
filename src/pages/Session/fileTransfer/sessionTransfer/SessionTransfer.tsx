import React, {useContext, useEffect, useState, useRef} from "react";
import {Dropdown, Form, Input, message, Modal, Space, Tree, Divider} from "antd";

const {Search} = Input;

const {DirectoryTree} = Tree;

import "./SessionTransfer.less"
import {sessionIdRef} from "@/pages/Session/main/Main";
import {AppContext} from "@/pages/context/AppContextProvider";

const SessionTransfer: React.FC = (props) => {
    const [treeData, setTreeData] = useState([{
        title: '/',
        key: '/'
    },]);

    const dragWindowRef = useRef(null);

    const {activeKey} = useContext(AppContext);

    const [searchValue, setSearchValue] = useState('/');

    function getFileList(param) {
        sessionIdRef[activeKey]?.callback('get_remote_file_list', searchValue, (result) => {
            // console.log(result);
            setTreeData(result);
        });
    }

    useEffect(() => {
        getFileList(searchValue);
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
                type: 'uploadFiles',
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
                    selectable={false}
                    multiple
                    draggable={true}
                    treeData={treeData}
                    expandAction={'doubleClick'}
                    // onDragEnd={function ({event, node}) {
                    //     console.log("onDragEnd", event, node, event.dataTransfer.files)
                    // }}
                    // onDragEnter={function ({event, node, expandedKeys}) {
                    //     console.log("onDragEnter", event, node, expandedKeys, event.dataTransfer.files)
                    // }}
                    // onDragLeave={function ({event, node}) {
                    //     console.log("onDragLeave", event, node, event.dataTransfer.files)
                    // }}
                    // onDragOver={function ({event, node}) {
                    //     console.log("onDragOver", event, node, event.dataTransfer.files)
                    // }}
                    // onDragStart={function ({event, node}) {
                    //     console.log("onDragStart", event, node, event.dataTransfer.files)
                    // }}
                    // onDrop={function ({event, node, dragNode, dragNodesKeys}) {
                    //     console.log("onDrop", event, node, dragNode, dragNodesKeys, event.dataTransfer.files)
                    // }}
                />
            </div>

        </Space>
    </>
};

export default SessionTransfer;
