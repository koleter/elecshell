import React from 'react';
import AppProviders from '@/features/AppProviders';
import { desktop } from '@/platform/electronBridge';
import Header from './frame/header';
import SettingModal from '@/features/settings/components/variables/SettingModal';
import ProjectConfigModal from '@/features/settings/components/project/ProjectConfigModal';
import { HEADER_HEIGHT } from '@/const';

// 主窗口与独立窗口共用相同页面外壳，保持设置弹窗、上下文和标题栏尺寸一致。
const SessionFrame: React.FC = ({ children }) => {
    const isMac = desktop.platform === 'darwin';
    return (
        <AppProviders>
            <SettingModal />
            <ProjectConfigModal />
            <div style={{ height: '100vh' }}>
                {isMac && <Header />}
                <div
                    style={{
                        position: 'relative',
                        height: isMac ? `calc(100vh - ${HEADER_HEIGHT}px)` : '100vh',
                    }}
                >
                    {children}
                </div>
            </div>
        </AppProviders>
    );
};

export default SessionFrame;
