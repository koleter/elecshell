import React, {useEffect} from "react";
import SessionMain from "./main/Main"
import SessionFrame from './SessionFrame';

const Session: React.FC = () => {
    useEffect(() => {
        // 保留原有关闭窗口按键拦截，按组件生命周期绑定，避免重渲染后重复注册。
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'w' && (event.ctrlKey || event.metaKey)) event.preventDefault();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return <SessionFrame><SessionMain/></SessionFrame>;
}

export default Session;
