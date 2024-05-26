import React, {useContext, useEffect, useState} from "react";
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

    const {activeKey} = useContext(AppContext);

    const [searchValue, setSearchValue] = useState('/');

    function getFileList(param) {
        sessionIdRef[activeKey]?.callback('get_remote_file_list', searchValue, (result) => {
            // console.log(result);
            setTreeData(result);
        })
    }

    useEffect(() => {
        getFileList(searchValue);
    }, []);

    return <>
        <Space direction="vertical" size="middle" style={{display: 'flex', overflow: 'auto'}}>
            <Search placeholder="input search text" onSearch={getFileList} enterButton value={searchValue}
                    onChange={(e) => {
                        // console.log(e);
                        setSearchValue(e.target.value);
                    }}/>


            <DirectoryTree
                className={'sftpFileList'}
                selectable={false}
                multiple
                treeData={treeData}
                expandAction={'doubleClick'}
            />
        </Space>
    </>
}

export default SessionTransfer;
