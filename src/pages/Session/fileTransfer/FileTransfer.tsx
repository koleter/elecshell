import React, {useContext, useEffect, useState} from "react";
import {AppContext} from "@/pages/context/AppContextProvider";
import SessionTransfer from "@/pages/Session/fileTransfer/sessionTransfer/SessionTransfer";

export const transferMap = {};

const FileTransfer: React.FC = (props) => {
    // const {sessions} = props;
    const {activeKey} = useContext(AppContext);

    if (!activeKey) {
        return <div></div>
    }

    var transferMapElement = transferMap[activeKey];
    if (!transferMapElement) {
        transferMapElement = <div>
            <SessionTransfer/>
        </div>;
        transferMap[activeKey] = transferMapElement;
    }
    return transferMapElement;

    // return <>
    //     {
    //         sessions.map((session) => {
    //             return <div style={{display: activeKey === session.key ? 'block' : 'none'}}>
    //                 <SessionTransfer/>
    //             </div>
    //         })
    //     }
    // </>
}

export default FileTransfer;
