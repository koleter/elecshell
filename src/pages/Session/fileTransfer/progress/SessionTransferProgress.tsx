import React, {useContext, useEffect} from "react";
import {Progress, Space, Tooltip} from "antd";
import {AppContext} from "@/pages/context/AppContextProvider";
import './SessionTransferProgress.less'

const SessionTransferProgress: React.FC<{sessionKey: string}> = (props) => {
    const { sessionKey } = props;
    const { fileProgressInfo, setFileProgressInfo } = useContext(AppContext);

    useEffect(() => {
        setFileProgressInfo(fileProgressInfo => ({
            ...fileProgressInfo,
            [sessionKey]: fileProgressInfo[sessionKey] || [],
        }));

        return () => {
            setFileProgressInfo(fileProgressInfo => {
                const { [sessionKey]: _, ...rest } = fileProgressInfo;
                return rest;
            });
        }
    }, []);

    return (
        <Space
            className={'SessionTransferProgress'}
            style={{
                display: fileProgressInfo[sessionKey]?.length ? 'block' : 'none',
                position: 'relative',
                flex: '0 0 30%',
                overflowY: 'auto',
            }}
            direction="vertical"
            size="small"
        >
            {fileProgressInfo[sessionKey]?.map((info) => {
                return (
                    <div key={info.id} className={'fileTransferProgress'}>
                        <Tooltip
                            className={'SessionTransferProgressTooltip'}
                            title={`${info.filePath} ${info.percent}%`}
                        >
                            <Progress percent={info.percent} />
                        </Tooltip>
                    </div>
                );
            })}
        </Space>
    );
};

export default SessionTransferProgress;
