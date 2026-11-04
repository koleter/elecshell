import React from 'react';
import { useWorkspace } from '../../workspace/model/WorkspaceProvider';
import { useShell } from '../../settings/model/ShellProvider';
import SessionTransfer from '@/features/transfers/components/sessionTransfer/SessionTransfer';
import { MENU_FILETRANSFER } from '@/const';
import './FileTransfer.less';

const FileTransfer: React.FC = () => {
    const {
        state: { sessions },
        activeKey,
    } = useWorkspace();
    const { selectedMenuKey } = useShell();

    return (
        <>
            {sessions.map((session) => {
                return (
                    <div
                        className={'FileTransfer'}
                        key={session.key}
                        style={{
                            display:
                                selectedMenuKey == MENU_FILETRANSFER && activeKey === session.key
                                    ? 'block'
                                    : 'none',
                        }}
                    >
                        <SessionTransfer session={session} />
                    </div>
                );
            })}
        </>
    );
};

export default React.memo(FileTransfer);
