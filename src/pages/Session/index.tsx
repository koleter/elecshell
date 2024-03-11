import React from "react";
import SessionMain from "./main/Main"
import {AppContextProvider} from "@/pages/context/AppContextProvider";
import Header from "@/pages/Session/frame/header";

const Session: React.FC = () => {
    return <AppContextProvider>
        <Header></Header>
        <SessionMain></SessionMain>
    </AppContextProvider>
}

export default Session;
