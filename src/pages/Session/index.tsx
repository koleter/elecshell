import React from "react";
import SessionMain from "./main/Main"
import {AppContextProvider} from "@/pages/context/AppContextProvider";
import Header from "@/pages/Session/frame/header";
import SettingModal from "@/pages/Session/components/modal/SettingModal";
import ProjectConfigModal from "@/pages/Session/components/projectConfig/ProjectConfigModal";
import {HEADER_HEIGHT} from "@/const";

const Session: React.FC = () => {
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
