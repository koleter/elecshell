import React, {useContext, useEffect, useState} from "react";
import {Dropdown, Form, Input, message, Modal, Tabs, Tree, Button} from "antd";
import {
    EditableProTable
} from '@ant-design/pro-components';
import Upload from "../components/upload/Upload"
import {DataNode, TreeProps} from "antd/es/tree";
import {request} from "@@/plugin-request/request";
import util, {defineValidatorWithErrMessage, getUUid} from "@/util";
import {sessionIdMapFileName} from "@/pages/Session/main/Main";
import {AppContext} from "@/pages/context/AppContextProvider";

const path = require('path');

const {DirectoryTree} = Tree;


const FileTransfer: React.FC = (props) => {
    const {setSessions, setActiveKey} = props;

    const {} = useContext(AppContext);

    return <>

        <DirectoryTree
            multiple
            treeData={treeData}
        />
    </>
}

export default FileTransfer;
