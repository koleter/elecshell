import React, {useContext, useEffect, useState} from "react";
import {AppContext} from "@/pages/context/AppContextProvider";
import SessionTransfer from "@/pages/Session/fileTransfer/sessionTransfer/SessionTransfer";

const FileTransfer: React.FC = (props) => {
    const {sessions} = props;
    const {activeKey} = useContext(AppContext);

    return <>
        {
            sessions.map((session) => {
                return <div style={{display: activeKey === session.key ? 'block' : 'none'}}>
                    <SessionTransfer/>
                </div>
            })
        }
    </>
}

export default FileTransfer;
