import { desktop } from '@/platform/electronBridge';
import React, { useEffect, useState } from 'react';
import SessionMain from '@/pages/Session/main/Main';
import SessionFrame from './SessionFrame';

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
    const tempPath = params.get('tempPath');

    const [initialContent, setInitialContent] = useState('');

    useEffect(() => {
        if (tempPath) {
            try {
                const content = desktop.readFile(tempPath);
                setInitialContent(content);
            } catch (e) {
                console.error('read detached initial content failed', e);
            } finally {
                try {
                    desktop.removeFile(tempPath);
                } catch (e) {
                    // ignore
                }
            }
        }
        desktop.setTitle(label);
    }, [tempPath, sessionId, label]);

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
        <SessionFrame>
            <SessionMain initialSession={session} initialContent={initialContent} />
        </SessionFrame>
    );
};

export default DetachedSession;
