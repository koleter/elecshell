import React from 'react';
import {AppContextProvider} from '@/pages/context/AppContextProvider';
import Header from './frame/header';
import SettingModal from './components/settingModal/SettingModal';
import ProjectConfigModal from './components/projectConfig/ProjectConfigModal';
import {HEADER_HEIGHT} from '@/const';

// 主窗口与独立窗口共用相同页面外壳，保持设置弹窗、上下文和标题栏尺寸一致。
const SessionFrame: React.FC = ({children}) => {
    const isMac = window.electronAPI.platform === 'darwin';
    return <AppContextProvider>
        <SettingModal/>
        <ProjectConfigModal/>
        <div style={{height: '100vh'}}>
            {isMac && <Header/>}
            <div style={{position: 'relative', height: isMac ? `calc(100vh - ${HEADER_HEIGHT}px)` : '100vh'}}>
                {children}
            </div>
        </div>
    </AppContextProvider>;
};

export default SessionFrame;
