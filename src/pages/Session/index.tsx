import React from "react";
import SessionMain from "./main/Main"
import {AppContextProvider} from "@/pages/context/AppContextProvider";
import Header from "@/pages/Session/frame/header";
import SettingModal from "@/pages/Session/components/modal/SettingModal";
import NameSpaceManagerModal from "@/pages/Session/components/namespace/NameSpaceManagerModal";

const Session: React.FC = () => {
    return <AppContextProvider>
        <SettingModal/>
        <NameSpaceManagerModal/>
        {window.electronAPI.platform == "darwin" && <Header></Header>}
        <SessionMain></SessionMain>
    </AppContextProvider>
}

export default Session;
