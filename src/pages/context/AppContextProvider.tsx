import {createContext, useEffect, useState, useRef} from 'react';
import util from "@/util";
import {message} from "antd";
import {sessionConfInfo} from "@/pages/Session/SessionList/SessionList";
import {NENU_SESSIONS} from "@/const";
import {setLocale} from "@@/plugin-locale/localeExports";
import {promptModalCancel} from "@/pages/Session/main/Main";

//根据定义创建Context
export const AppContext = createContext(null);

//定义ContextProvider，children是组件
export function AppContextProvider(props: { children: React.ReactNode | React.ReactNode[] }) {

    const [xshListWindowWidth, setXshListWindowWidth] = useState(250);
    const [showPrompt, setShowPrompt] = useState(false);
    const [promptTitle, setPromptTitle] = useState("");
    const [promptOKCallback, setPromptOKCallback] = useState("");
    const [promptUserInput, setPromptUserInput] = useState("");
    const promptInputRef = useRef(null);

    const promptModalCancelRef = useRef(null);

    const [treeData, setTreeData] = useState([]);
    const [refreshTreeData, setRefreshTreeData] = useState(0);
    const [sessionRootKey, setSessionRootKey] = useState("");

    const [activeKey, setActiveKey] = useState('');

    const [selectedMenuKey, setSelectedMenuKey] = useState(NENU_SESSIONS);

    const prompt = function (title, callback, defaultUserInput = "") {
        setPromptTitle(title);
        setPromptOKCallback(() => callback);
        setPromptUserInput(defaultUserInput);
        setShowPrompt(() => {
            setTimeout(() => {
                promptInputRef?.current?.focus();
            }, 0)
            return true;
        });
    }

    useEffect(() => {
        document.title = 'elecshell';
        util.request('conf', {
            method: 'GET',
            params: {
                type: 'GlobalAutoConfig',
            },
        }).then(res => {
            if (res.status !== 'success') {
                message[res.status](res.msg);
                return;
            }
            if (res.data.xshListWindowWidth) {
                // console.log(`xshListWindowWidth: ${res.data.xshListWindowWidth}`);
                setXshListWindowWidth(res.data.xshListWindowWidth);
            }
        })
    }, []);

    useEffect(() => {
        util.request('conf', {
            method: 'GET',
            params: {
                type: 'SessionConfig',
            },
            timeout: 10000,
        }).then(res => {
            if (res.status !== 'success') {
                message[res.status](res.msg);
            }
            Object.assign(sessionConfInfo, res.sessionConfInfo);
            setSessionRootKey(res.defaultTreeData[0].key);
            setTreeData(res.defaultTreeData);
        })
    }, [refreshTreeData])

    const [connectVariable, setConnectVariable] = useState([]);
    const [refreshConfigableGlobalConfig, setRefreshConfigableGlobalConfig] = useState(0);

    useEffect(() => {
        util.request('conf', {
            method: 'GET',
            params: {
                type: 'ConfigableGlobalConfig',
            }
        }).then(res => {
            if (res.status == 'success') {
                setConnectVariable(res?.data?.strVariableSetting || []);
            } else {
                message[res.status](res.msg);
            }
        })
    }, [refreshConfigableGlobalConfig])

    const [scriptData, setScriptData] = useState([]);
    const [refreshScriptData, setRefreshScriptData] = useState(0);
    useEffect(() => {
        util.request('conf', {
            method: 'GET',
            params: {
                type: 'ScriptConfig',
            },
        }).then(res => {
            if (res.status !== 'success') {
                message[res.status](res.msg);
            }
            setScriptData(res.scriptData);
        })
    }, [refreshScriptData])

    return (
        <AppContext.Provider value={{
            xshListWindowWidth,
            setXshListWindowWidth,
            // use for prompt
            promptInputRef,
            showPrompt,
            setShowPrompt,
            promptTitle,
            setPromptTitle,
            promptOKCallback,
            setPromptOKCallback,
            promptUserInput,
            setPromptUserInput,
            prompt,
            promptModalCancelRef,
            // sessionList
            treeData,
            setTreeData,
            refreshTreeData,
            setRefreshTreeData,
            sessionRootKey,
            // session
            activeKey, setActiveKey,
            // menu
            selectedMenuKey, setSelectedMenuKey,
            // global config
            connectVariable, setConnectVariable,
            // refresh global config
            refreshConfigableGlobalConfig, setRefreshConfigableGlobalConfig,
            // scriptData
            scriptData, setScriptData, refreshScriptData, setRefreshScriptData,
        }}>{/** value就是可在<AppContextProvider>组件的子组件中使用useContext() hook函数所获取的对象 */}
            {props.children}
        </AppContext.Provider>
    );
}
