import React from 'react';
import { Progress, Space, Tooltip } from 'antd';
import { useTransferProgress } from '../../model/TransferProvider';
import './SessionTransferProgress.less';

const SessionTransferProgress: React.FC<{ sessionKey: string }> = (props) => {
    const { sessionKey } = props;
    const progress = useTransferProgress(sessionKey);

    return (
        <Space
            className={'SessionTransferProgress'}
            style={{
                display: progress.length ? 'block' : 'none',
                position: 'relative',
                flex: '0 0 30%',
                overflowY: 'auto',
            }}
            direction="vertical"
            size="small"
        >
            {progress.map((info) => {
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
