import React, {useContext, useEffect, useState} from "react";
import {Progress, Space} from "antd";
import {sessionIdRef, sessionInit} from "@/pages/Session/main/Main";
import {AppContext} from "@/pages/context/AppContextProvider";


const SessionTransferProgress: React.FC = (props) => {
    const {session} = props;
    const {activeKey} = useContext(AppContext);

    const [fileProgressInfo, setFileProgressInfo] = useState(new Map());

    useEffect(() => {
        if (!sessionInit[session.key]) {
            sessionInit[session.key] = [];
        }

        sessionInit[session.key].push(() => {
            if (sessionIdRef[activeKey]) {
                sessionIdRef[activeKey].refreshFileProgressInfo = (result) => {
                    console.log(result);
                    setFileProgressInfo(fileProgressInfo => {
                        const data = new Map(fileProgressInfo);
                        for (const info of result) {
                            data.set(info.key, info);
                        }
                        return data;
                    })
                };
            }
        });
    }, []);

    return <>
        <Space direction="vertical" size="small">
            {
                Array.from(fileProgressInfo.values()).map(info => {
                    return <Progress format={() => {
                        return info.filePath;
                    }} percent={info.percent}/>
                })
            }
        </Space>
    </>
};

export default React.memo(SessionTransferProgress);
