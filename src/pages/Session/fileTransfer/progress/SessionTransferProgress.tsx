import React, {useContext, useEffect, useState} from "react";
import {Progress, Space, Tooltip} from "antd";
import {sessionIdRef, sessionInit} from "@/pages/Session/main/Main";
import {AppContext} from "@/pages/context/AppContextProvider";
import './SessionTransferProgress.less'
const path = require('path');

const SessionTransferProgress: React.FC = (props) => {
    const {session} = props;
    const {activeKey} = useContext(AppContext);

    const [fileProgressInfo, setFileProgressInfo] = useState([]);

    useEffect(() => {
        if (!sessionInit[session.key]) {
            sessionInit[session.key] = [];
        }

        sessionInit[session.key].push(() => {
            if (sessionIdRef[activeKey]) {
                sessionIdRef[activeKey].refreshFileProgressInfo = (result) => {
                    // console.log(result);
                    setFileProgressInfo(fileProgressInfo => {
                        const data = [...fileProgressInfo];
                        for (const info of data) {
                            if (info.id === result.id) {
                                info.percent = result.percent;
                                return data;
                            }
                        }
                        data.push(result);

                        return data;
                    })
                };
            }
        });
    }, []);

    // const sortedFileProgressInfo = fileProgressInfo.slice().sort((a, b) => {
    //     if (a.percent == b.percent) {
    //         return 0;
    //     }
    //     if (a.percent == 100) {
    //         return 1;
    //     }
    //     if (b.percent == 100) {
    //         return -1;
    //     }
    //     return 0;
    // });

    return <Space
        style={{display: fileProgressInfo.length ? 'block' : "none", position: 'relative', flex: '0 0 30%', overflowY: 'auto'}}
        direction="vertical"
        size="small"
    >
        {
            Array.from(fileProgressInfo.values()).map(info => {
                return <div key={info.id} className={'fileTransferProgress'}>
                    <Tooltip className={'SessionTransferProgressTooltip'} title={`${info.filePath} ${info.percent}%`}>
                        <Progress
                            percent={info.percent}
                        />
                        {/*<span className={'fileTransferProgressPath'}>{path.basename(info.filePath)}</span>*/}
                    </Tooltip>
                </div>
            })
        }
    </Space>
};

export default React.memo(SessionTransferProgress);
