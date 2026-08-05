import React, {useContext, useEffect, useState} from "react";
import {Progress, Space, Tooltip} from "antd";
import {sessionIdRef} from "@/pages/Session/main/Main";
import {AppContext} from "@/pages/context/AppContextProvider";
import './SessionTransferProgress.less'
const path = require('path');

const SessionTransferProgress: React.FC = (props) => {
    const { activeKey, fileProgressInfo, setFileProgressInfo } = useContext(AppContext);

    useEffect(() => {
        setFileProgressInfo(fileProgressInfo => ({
            ...fileProgressInfo,
            [activeKey]: [],
        }));

        return () => {
            setFileProgressInfo(fileProgressInfo => {
                const { [activeKey]: _, ...rest } = fileProgressInfo;
                return rest;
            });
        }
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

    console.log('activeKey', activeKey, 'fileProgressInfo[activeKey]', fileProgressInfo[activeKey]);

    return (
        <Space
            className={'SessionTransferProgress'}
            style={{
                display: fileProgressInfo[activeKey]?.length ? 'block' : 'none',
                position: 'relative',
                flex: '0 0 30%',
                overflowY: 'auto',
            }}
            direction="vertical"
            size="small"
        >
            {fileProgressInfo[activeKey]?.map((info) => {
                return (
                    <div key={info.id} className={'fileTransferProgress'}>
                        <Tooltip
                            className={'SessionTransferProgressTooltip'}
                            title={`${info.filePath} ${info.percent}%`}
                        >
                            <Progress percent={info.percent} />
                            {/*<span className={'fileTransferProgressPath'}>{path.basename(info.filePath)}</span>*/}
                        </Tooltip>
                    </div>
                );
            })}
        </Space>
    );
};

export default SessionTransferProgress;
