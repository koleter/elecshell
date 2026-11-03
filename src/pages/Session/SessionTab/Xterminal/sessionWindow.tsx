import React, {useCallback, useContext, useEffect, useRef, useState} from "react";
import {Terminal} from "xterm"
import "xterm/css/xterm.css"
import util, {callbackMap, getUUid, sessionStatusMap, showMessage} from "../../../../util"
import {CONNECTED, CONNECTING} from "../../../../const"
import {sessionConfInfo, sessionIdMapFileName, sessionIdRef} from "../../sessionRuntime"
import type {TerminalSession} from "../../components/SessionWorkspace/layout";
import {SearchAddon} from 'xterm-addon-search'
import type {ISearchOptions} from 'xterm-addon-search';
import type {TextAreaRef} from 'antd/es/input/TextArea';
import {FitAddon} from 'xterm-addon-fit'
import {SerializeAddon} from 'xterm-addon-serialize'
import "./SessionWindow.less"
import {AppContext} from "@/pages/context/AppContextProvider";
import {Button, Input, Tooltip} from 'antd';
import {ArrowDownOutlined, ArrowUpOutlined, CloseOutlined} from '@ant-design/icons';

// 查询框中所有元素的高度
const searchPanelHeight = '34px';

const defaultSearchOption = {
    decorations: {
        matchBackground: "rgba(255,89,189,0.4)",
        matchBorder: "rgba(255,89,189,0.4)",
        matchOverviewRuler: "rgba(255,89,189,0.4)",
        activeMatchBackground: "#A6D2FF",
        activeMatchBorder: "#A6D2FF",
        activeMatchColorOverviewRuler: "#A6D2FF",
    }
};

// 搜索按钮只描述差异，状态切换与查找流程统一处理。
const searchOptionButtons = [
    {key: 'caseSensitive', render: 'Cc', title: 'match case'},
    {key: 'wholeWord', render: 'W', title: 'words'},
    {key: 'regex', render: 'Exp', title: 'regexp'},
] as const;
const findButtons = [
    {method: 'findPrevious', render: <ArrowUpOutlined/>, title: 'Previous Occurrence'},
    {method: 'findNext', render: <ArrowDownOutlined/>, title: 'Next Occurrence'},
] as const;

const termOptions = {
    rendererType: "canvas",
    fontSize: 12,
    cursorBlink: true,
    theme: {
        background: 'black',
        foreground: 'white',
        cursor: 'white'
    },
    allowProposedApi: true
};

type SessionCallback = (...args: any[]) => void;

interface SessionWindowProps {
    id: string;
    sessionConfId?: string;
    setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>;
    isConnected: boolean;
    encoding?: string;
    session: TerminalSession;
    initialContent?: string;
    visible: boolean;
    focused: boolean;
}

const SessionWindow: React.FC<SessionWindowProps> = (props) => {
    const terminalRef = useRef<null | HTMLDivElement>(null);
    const {id, sessionConfId, setSessions, isConnected, encoding = "utf-8", session, initialContent, visible, focused} = props;
    const context = useContext<any>(AppContext);
    const searchInputRef = useRef<TextAreaRef>(null);
    const {promptModalCancelRef} = context;
    // 连接回调长期存活，通过 ref 读取最新上下文，避免界面变化引起连接重建。
    const contextRef = useRef(context);
    contextRef.current = context;
    // 展示搜索框
    const [showSearch, setShowSearch] = useState(false);
    // detached window 终端是否已准备就绪
    const [termReady, setTermReady] = useState(false);
    const initialContentWrittenRef = useRef(false);

    // 一个会话只创建一个终端实例，跨分屏移动或切换标签均复用该实例及其缓冲区。
    const [term] = useState<any>(() => new Terminal(termOptions));
    const openedRef = useRef(false);
    const visibleRef = useRef(visible);
    const focusedRef = useRef(focused);
    const sessionRef = useRef(session);
    visibleRef.current = visible;
    focusedRef.current = focused;
    sessionRef.current = session;
    const fitFrame = useRef(0);
    const fitTerminal = useCallback(() => {
        // 分屏拖动会连续改变容器尺寸，每帧最多 fit 一次；隐藏/零尺寸时跳过以免算错行列。
        cancelAnimationFrame(fitFrame.current);
        fitFrame.current = requestAnimationFrame(() => {
            const element = terminalRef.current;
            if (openedRef.current && visibleRef.current && element && element.clientWidth > 0 && element.clientHeight > 0) {
                term._fitAddon?.fit();
            }
        });
    }, [term]);

    const [searchOptions, setSearchOptions] = useState<ISearchOptions>(defaultSearchOption);

    const [searchValue, setSearchValue] = useState("");
    const searchValueRef = useRef(searchValue);
    searchValueRef.current = searchValue;

    const toggleSearchOption = (key: (typeof searchOptionButtons)[number]['key']) => {
        const options = {...searchOptions, [key]: !searchOptions[key]};
        setSearchOptions(options);
        term._searchAddon.clearDecorations();
        term._searchAddon.findPrevious(searchValue, options);
    };

    const globalMethodMap: Record<string, (...args: any[]) => void> = {
        prompt: (msg: string, callback: SessionCallback, cancelCallback: SessionCallback) => {
            promptModalCancelRef.current = cancelCallback;
            context.prompt(msg, callback);
        },
        createNewSession: (sessionConfs: any[], callback?: (sessions: any[]) => void) => {
            const arr: Promise<any>[] = [];
            sessionConfs.forEach(sessionConf => {
                let body;
                switch (Object.prototype.toString.call(sessionConf)) {
                    case "[object String]":
                        if (!(sessionConf in sessionConfInfo)) {
                            showMessage({
                                status: 'error',
                                content: `invalid sessionConfId: ${sessionConf}`
                            });
                            return;
                        }
                        body = {
                            sessionConfId: sessionConf,
                            filePath: sessionConfInfo[sessionConf]
                        };
                        break;
                    case '[object Object]':
                        if (!(sessionConf.conf_id in sessionConfInfo)) {
                            showMessage({
                                status: 'error',
                                content: `invalid sessionConfId: ${sessionConf.conf_id}`
                            });
                            return;
                        }
                        body = {
                            sessionConfId: sessionConf.conf_id,
                            filePath: sessionConfInfo[sessionConf.conf_id],
                            sessionName: sessionConf.session_name
                        };
                }
                arr.push(util.request("session", {
                    method: 'POST',
                    body: JSON.stringify(body),
                }));
            });

            Promise.all(arr).then(res => {
                for (let i = 0; i < res.length; i++) {
                    if (res[i].status) {
                        showMessage(res[i]);
                        return;
                    }
                }

                // 保存新创建的所有会话的id
                const newSessionIds: string[] = [];
                let hasError = false;
                for (let i = 0; i < res.length; i++) {
                    const item = res[i];
                    if (!item.filePath) {
                        showMessage({
                            status: 'error',
                            content: item.status
                        });
                        hasError = true;
                    }
                    newSessionIds.push(item.id);
                }
                if (hasError) {
                    return;
                }
                // 先构建会话数据再提交纯更新，配置路径与编码随会话一起保留。
                const addedSessions = res.map(item => {
                    sessionIdMapFileName[item.id] = item.filePath.split(/[\\/]/).pop() || item.filePath;
                    return {
                        label: item.sessionName,
                        key: item.id,
                        sessionConfId: item.sessionConfId || item.filePath,
                        sessionConfPath: item.filePath,
                        encoding: item.encoding || encoding,
                        isConnected: true,
                    };
                });
                setSessions(previous => [...previous, ...addedSessions]);

                // 等待新会话连接后再通知脚本；轮询放在状态更新函数外，避免重复执行副作用。
                function checkAllSessionIsReady(time: number) {
                    if (time > 4000) return;
                    if (newSessionIds.some(sessionId => sessionStatusMap[sessionId] !== CONNECTED)) {
                        setTimeout(() => checkAllSessionIsReady(time + 200), 200);
                        return;
                    }
                    callback?.(res);
                }
                checkAllSessionIsReady(0);
            })
        }
    };

    // 服务端调用全局方法时使用当前版本，避免拖拽后仍调用旧的上下文或会话状态。
    const methodsRef = useRef(globalMethodMap);
    methodsRef.current = globalMethodMap;

    const closeSearchPanel = () => {
        setShowSearch(false);
        term._searchAddon.clearDecorations();
        term.focus();
    }

    const openSearchPanel = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.shiftKey && e.ctrlKey && e.key.toLowerCase() === 'f') {
            // 捕获阶段拦截原有搜索快捷键，避免被 xterm 当作输入发送到远端。
            e.preventDefault();
            e.stopPropagation();
            const selection = term.getSelection();
            if (selection) {
                setSearchValue(selection);
            }
            setShowSearch(true);
            term._searchAddon.findPrevious(selection, searchOptions);
        }
    }

    useEffect(() => {
        if (!showSearch || !visible || !focused) return undefined;
        // 仅在当前可见且聚焦的分屏中移动搜索焦点，切换标签时取消尚未执行的任务。
        const frame = requestAnimationFrame(() => searchInputRef.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, [showSearch, visible, focused]);

    // 插件和尺寸观察器与终端共同创建/销毁，不随分屏位置和可见性重复初始化。
    useEffect(() => {
        const searchAddon = new SearchAddon();
        const fitAddon = new FitAddon();
        const serializeAddon = new SerializeAddon();
        term.loadAddon(searchAddon);
        term.loadAddon(fitAddon);
        term.loadAddon(serializeAddon);
        term._searchAddon = searchAddon;
        term._fitAddon = fitAddon;
        term._serializeAddon = serializeAddon;
        const observer = new ResizeObserver(fitTerminal);
        if (terminalRef.current) observer.observe(terminalRef.current);
        return () => {
            observer.disconnect();
            cancelAnimationFrame(fitFrame.current);
            term.dispose();
        };
    }, [term, fitTerminal]);

    // 连接跟随会话生命周期；布局、焦点、搜索和日志路径变化都不会触发重连。
    useEffect(() => {
        if (!isConnected) return undefined;
        let disposed = false;
        let socket: WebSocket | null = null;
        const subscriptions: {dispose: () => void}[] = [];
        const clearRuntime = () => {
            // 旧连接的异步清理不能误删同一会话 ID 下已经建立的新连接。
            if (sessionIdRef[id]?.sock !== socket) return;
            delete sessionIdRef[id];
            delete sessionIdMapFileName[id];
            delete sessionStatusMap[id];
        };
        const connect = async () => {
            const raw_url = await util.getUrl();
            // 页面可能在异步获取地址期间被关闭，此时不再建立孤立连接。
            if (disposed) return;
            const ws_url = raw_url.split(/\?|#/, 1)[0].replace('http', 'ws'),
                join = (ws_url[ws_url.length - 1] === '/' ? '' : '/'),
                url = ws_url + join + 'ws?id=' + id,
                decoder = new TextDecoder(encoding);

            function decode(val: string) {
                // 先用atob解码Base64字符串
                const raw = atob(val);
                // 创建一个Uint8Array，存储解码后的字节
                const bytes = new Uint8Array(new ArrayBuffer(raw.length));

                // 将每个ASCII字符转换为字节
                for (let i = 0; i < raw.length; i++) {
                    bytes[i] = raw.charCodeAt(i);
                }
                return decoder.decode(bytes);
            }

            const sock = new window.WebSocket(url);
            socket = sock;
            sessionStatusMap[id] = CONNECTING;

            sock.onopen = function () {
                // resize_terminal(term);
                sessionStatusMap[id] = CONNECTED;

                function sendTermResizeMessage(cols: number, rows: number) {
                    if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({'type': 'resize', 'resize': [cols, rows]}));
                }

                function termResize(size: {cols: number; rows: number}) {
                    const {cols, rows} = size;
                    sendTermResizeMessage(cols, rows);
                }

                subscriptions.push(term.onResize(termResize));

                // 先订阅 resize 再首次打开终端，确保初始化产生的行列变化也能同步到远端。
                if (!openedRef.current) {
                    term.open(terminalRef.current as HTMLDivElement);
                    openedRef.current = true;
                }
                if (visibleRef.current && focusedRef.current) term.focus();

                setTermReady(true);

                fitTerminal();
            };

            // 脚本和文件传输通过会话 ID 访问运行时，不依赖该会话处于哪个分屏。
            sessionIdRef[id] = {
                id: id,
                sock: sock,
                term: term,
                sessionConfId,
                send: function (msg: object) {
                    sock.send(JSON.stringify(msg));
                },
                sendData: function (data: string) {
                    sock.send(JSON.stringify({ data: data, type: 'data' }));
                },
                sendRecv: function (cmd: string, f: SessionCallback) {
                    const requestId = getUUid();
                    callbackMap[requestId] = f;
                    sock.send(
                        JSON.stringify({ data: cmd, requestId: requestId, type: 'sendRecv' }),
                    );
                },
                callback: async function (methodName: string, args: any, callback: SessionCallback) {
                    const uid = getUUid();
                    callbackMap[uid] = callback;
                    this.send({
                        type: 'recallback',
                        args: args,
                        methodName: methodName,
                        requestId: uid,
                    });
                },
                refreshRemoteFileList: (prev: any[]) => {
                    // console.log(prev);
                    const newTreeData = [{
                        title: '..',
                        key: '..',
                        isLeaf: false,
                        remoteDirectory: searchValueRef.current,
                    }, ...prev];
                    contextRef.current.setSessionTransferTreeData((treeData: any) => ({
                        ...treeData,
                        [id]: newTreeData,
                    }));
                },
                refreshFileProgressInfo: (result: any) => {
                    // console.log(result);
                    contextRef.current.setFileProgressInfo((fileProgressInfo: any) => {
                        const data = [...(fileProgressInfo[id] || [])];
                        let exist = false;
                        for (const info of data) {
                            if (info.id === result.id) {
                                info.percent = result.percent;
                                exist = true;
                                break;
                            }
                        }
                        if (!exist) {
                            data.push(result);
                        }

                        return {
                            ...fileProgressInfo,
                            [id]: data,
                        };
                    });
                },
            };

            sock.onerror = function (e) {
                console.error(e);
            };

            subscriptions.push(term.onData(function (data: string) {
                if (sock.readyState === WebSocket.OPEN) sock.send(JSON.stringify({'data': data, 'type': 'data'}));
            }));

            function wsockCallback(res: any) {
                switch (res.type) {
                    case 'data':
                        // 使用TextDecoder将字节序列转换为UTF-8字符串
                        term.write(decode(res.val), (raw: string) => {
                            if (res.requestId && !disposed && sock.readyState === WebSocket.OPEN) {
                                sessionIdRef[id]?.send({
                                    type: 'callback',
                                    requestId: res.requestId,
                                    args: raw
                                })
                            }

                            if (sessionRef.current.logPath) {
                                try {
                                    window.electronAPI.FS_appendFileSync(sessionRef.current.logPath, raw);
                                } catch (err) {
                                    showMessage({
                                        status: 'error',
                                        content: err
                                    })
                                }
                            }
                        }, res.showOnTerm);
                        break;
                    case 'message':
                        showMessage(res);
                        break;
                    case 'execSessionMethod':
                        if (res.requestId) {
                            sessionIdRef[id][res.method](res.args, (callbackResponse: any) => {
                                sessionIdRef[id].send({
                                    type: 'callback',
                                    requestId: res.requestId,
                                    args: callbackResponse
                                })
                            })
                        } else {
                            sessionIdRef[id][res.method](res.args);
                        }
                        break;
                    case 'execMethod':
                        if (res.requestId) {
                            methodsRef.current[res.method](res.args, (callbackResponse: any) => {
                                sessionIdRef[id].send({
                                    type: 'callback',
                                    requestId: res.requestId,
                                    args: callbackResponse
                                })
                            }, ()=> {
                                sessionIdRef[id].send({
                                    type: 'del_callback_map',
                                    requestId: res.requestId
                                })
                            })
                        } else {
                            methodsRef.current[res.method](res.args);
                        }
                        break;
                    case 'eval':
                        const result = eval(`${res.method}('${res.args}')`);
                        if (res.requestId) {
                            sessionIdRef[id].send({
                                type: 'callback',
                                requestId: res.requestId,
                                args: result
                            })
                        }
                        break;
                    case 'response':
                        callbackMap[res.requestId](decode(res.val));
                        delete callbackMap[res.requestId];
                        break;
                    default:
                        throw new Error(`unexpected result type: ${res.type}`);
                }
            }

            sock.onclose = () => {
                if (disposed) return;
                term.write("\r\nthis session is closed.....");
                clearRuntime();
                setSessions(previous => previous.map(item => item.key === id ? {...item, isConnected: false} : item));
            };
            sock.onmessage = message => {
                if (!disposed) wsockCallback(JSON.parse(message.data));
            };
        };
        connect().catch(error => {
            if (disposed) return;
            console.error('initialize terminal connection failed', error);
            setSessions(previous => previous.map(item => item.key === id ? {...item, isConnected: false} : item));
        });
        return () => {
            // 先屏蔽旧回调，再清理终端事件和 socket，避免关闭过程中修改已移除会话。
            disposed = true;
            subscriptions.forEach(subscription => subscription.dispose());
            if (socket) {
                socket.onopen = null;
                socket.onmessage = null;
                socket.onclose = null;
                socket.onerror = null;
                socket.close();
            }
            clearRuntime();
        };
    }, [isConnected, id, term, encoding, sessionConfId, fitTerminal, setSessions]);

    useEffect(() => {
        if (!visible || !termReady) return undefined;
        fitTerminal();
        const frame = requestAnimationFrame(() => {
            const container = terminalRef.current?.parentElement;
            // 焦点已在该终端的搜索框等子控件中时保留它，避免 fit 后抢走输入焦点。
            if (focused && !container?.contains(document.activeElement)) term.focus();
        });
        return () => cancelAnimationFrame(frame);
    }, [visible, focused, termReady, term, fitTerminal]);

    // 独立窗口首次准备好后只回放一次历史内容，后续重渲染不会重复追加。
    useEffect(() => {
        if (termReady && initialContent && !initialContentWrittenRef.current) {
            try {
                term.write(initialContent);
                initialContentWrittenRef.current = true;
            } catch (e) {
                console.error('write initial content failed', e);
            }
        }
    }, [termReady, initialContent, term]);

    return (
        <div className="session-terminal" onKeyDownCapture={openSearchPanel}
             style={{height: '100%', minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column'}}>
            <div className="session-search-panel" style={{display: showSearch ? 'flex' : 'none'}}>
                <div className="session-search-fields">
                    <Input.TextArea ref={searchInputRef} allowClear={true} autoSize={true} value={searchValue}
                                    style={{flex: '1 1 120px', minWidth: 0}}
                                    onChange={(newVal) => {
                                        term._searchAddon.findNext(newVal.target.value, searchOptions);
                                        setSearchValue(newVal.target.value);
                                    }}/>
                    <div className="session-search-actions">
                        {
                            searchOptionButtons.map((item) => {
                                return <Tooltip key={item.title} title={item.title} color={'white'} overlayInnerStyle={{color: 'black'}}>
                                    <Button className={'searchOptions'} type={searchOptions[item.key] ? 'primary' : 'text'}
                                            style={{height: searchPanelHeight}}
                                            onClick={() => toggleSearchOption(item.key)}>{item.render}</Button>
                                </Tooltip>
                            })
                        }

                        {
                            findButtons.map((item) => {
                                return <Tooltip key={item.title} title={item.title} color={'white'} overlayInnerStyle={{color: 'black'}}>
                                    <Button className={'searchOptions'} style={{height: searchPanelHeight}}
                                            onClick={() => term._searchAddon[item.method](searchValue, searchOptions)}>{item.render}</Button>
                                </Tooltip>
                            })
                        }
                    </div>
                </div>
                <Button type="text" size="small" aria-label="Close search" icon={<CloseOutlined/>} onClick={closeSearchPanel}/>

            </div>

            <div style={{flex: '1 1 0', minWidth: 0, minHeight: 0, backgroundColor: 'black', overflow: 'hidden'}} ref={terminalRef}/>
        </div>
    )
}

export default React.memo(SessionWindow);
