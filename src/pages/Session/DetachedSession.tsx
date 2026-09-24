import React, {useEffect, useState} from "react";
import SessionMain from "@/pages/Session/main/Main";
import {AppContextProvider} from "@/pages/context/AppContextProvider";
import Header from "@/pages/Session/frame/header";
import SettingModal from "@/pages/Session/components/settingModal/SettingModal";
import ProjectConfigModal from "@/pages/Session/components/projectConfig/ProjectConfigModal";
import {HEADER_HEIGHT} from "@/const";

function getQueryParams() {
    const search = window.location.search;
    if (search) {
        return new URLSearchParams(search);
    }
    const hash = window.location.hash;
    const queryIndex = hash.indexOf('?');
    const queryString = queryIndex >= 0 ? hash.slice(queryIndex + 1) : '';
    return new URLSearchParams(queryString);
}

const DetachedSession: React.FC = () => {
    const params = getQueryParams();
    const sessionId = params.get('sessionId') || '';
    const label = params.get('label') || sessionId;
    const encoding = params.get('encoding') || 'utf-8';
    const logPath = params.get('logPath') || '';
    const sessionConfId = params.get('sessionConfId') || '';
    const sessionConfPath = params.get('sessionConfPath') || '';

    const [initialContent, setInitialContent] = useState('');

    useEffect(() => {
        const tempPath = params.get('tempPath');
        if (tempPath) {
            try {
                const content = window.electronAPI.FS_readFileSync(tempPath, 'utf-8');
                setInitialContent(content);
            } catch (e) {
                console.error('read detached initial content failed', e);
            } finally {
                try {
                    window.electronAPI.FS_unlinkSync(tempPath);
                } catch (e) {
                    // ignore
                }
            }
        }
        window.electronAPI.ipcRenderer.send('update-title', label);
    }, [sessionId, label]);

    const session = {
        key: sessionId,
        label,
        encoding,
        logPath,
        sessionConfId,
        isConnected: true,
        sessionConfPath,
    };

    return (
        <AppContextProvider>
            <SettingModal/>
            <ProjectConfigModal/>
            <div style={{height: '100vh'}}>
                {window.electronAPI.platform == "darwin" && <Header/>}
                <div style={{position: 'relative', height: window.electronAPI.platform === 'darwin' ? `calc(100vh - ${HEADER_HEIGHT}px)` : '100vh'}}>
                    <SessionMain
                        initialSession={session}
                        initialContent={initialContent}
                        detached={true}
                    />
                </div>
            </div>
        </AppContextProvider>
    );
};

export default DetachedSession;
