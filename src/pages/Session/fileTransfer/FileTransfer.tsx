import React, {useContext, useEffect, useState} from "react";
import {AppContext} from "@/pages/context/AppContextProvider";
import SessionTransfer from "@/pages/Session/fileTransfer/sessionTransfer/SessionTransfer";
import {MENU_FILETRANSFER} from "@/const";

const FileTransfer: React.FC = (props) => {
    const {sessions} = props;
    const {activeKey} = useContext(AppContext);

    return <>
        {
            sessions.map((session) => {
                return <div key={session.key} style={{display: activeKey === session.key ? 'block' : 'none'}}>
                    <SessionTransfer session={session}/>
                </div>
            })
        }
    </>
}

export default FileTransfer;
