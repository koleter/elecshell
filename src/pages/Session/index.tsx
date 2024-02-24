import React from "react";
import SessionMain from "./main/Main"
import {AppContextProvider} from "@/pages/context/AppContextProvider";

const Session: React.FC = () => {
  return <AppContextProvider>
    <SessionMain></SessionMain>
  </AppContextProvider>
}

export default Session;
