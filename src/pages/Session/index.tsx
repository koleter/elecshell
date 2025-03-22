import React from "react";
import SessionMain from "./main/Main"
import {AppContextProvider} from "@/pages/context/AppContextProvider";
import Header from "@/pages/Session/frame/header";
import SettingModal from "@/pages/Session/components/settingModal/SettingModal";
import ProjectConfigModal from "@/pages/Session/components/projectConfig/ProjectConfigModal";
import {HEADER_HEIGHT} from "@/const";

const Session: React.FC = () => {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'w' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault(); // 禁用默认行为
            // 在这里添加自定义逻辑
            console.log('Ctrl+W 被按下，但窗口不会关闭');
            // 例如，你可以显示一个对话框或执行其他操作
            // dialog.showMessageBox({ message: 'Ctrl+W 被按下，但窗口不会关闭' });
        }
    });

    return <AppContextProvider>
        <SettingModal/>
        <ProjectConfigModal/>
        <div style={{height: '100vh'}}>
            {window.electronAPI.platform == "darwin" && <Header/>}
            <div style={{position: 'relative', height: window.electronAPI.platform == "darwin" ? `calc(100vh - ${HEADER_HEIGHT}px)` : '100vh'}}>
                <SessionMain></SessionMain>
            </div>
        </div>

    </AppContextProvider>
}

export default Session;
