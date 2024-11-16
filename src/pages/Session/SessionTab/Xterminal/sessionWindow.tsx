import {useEffect, useRef, useContext, useState} from "react";
import React from "react";
import {Terminal} from "xterm"
import "xterm/css/xterm.css"
import util, {sleep, callbackMap, sessionStatusMap, showMessage, getUUid} from "../../../../util"
import {DISCONNECTED, CONNECTING, CONNECTED, HEADER_HEIGHT} from "../../../../const"
import {sessionIdRef, sessionIdMapFileName, sessionInit} from "../../main/Main"
import {SearchAddon} from 'xterm-addon-search'
import {FitAddon} from 'xterm-addon-fit'
import {request} from 'umi';
import "./SessionWindow.less"
import {sessionConfInfo} from "@/pages/Session/SessionList/SessionList";
import {AppContext} from "@/pages/context/AppContextProvider";
import {Input, Button, Tooltip} from 'antd';
import {
    ArrowUpOutlined,
    ArrowDownOutlined
} from '@ant-design/icons';
import {getTermHeight} from "@/pages/util/style";

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

const SessionWindow: React.FC = (props) => {
    const terminalRef = useRef<null | HTMLDivElement>(null);
    const {id, sessionConfId, setSessions, isConnected, encoding, session} = props;
    const context = useContext(AppContext);
    const searchInputRef = useRef(null);
    const {activeKey} = context;
    // 展示搜索框
    const [showSearch, setShowSearch] = useState(false);

    const [term] = useState(new Terminal(termOptions));

    const [matchCase, setMatchCase] = useState(false);
    const [words, setWords] = useState(false);
    const [regexp, setRegexp] = useState(false);

    const [searchValue, setSearchValue] = useState("");

    const matchButtons = [
        {
            render: "Cc",
            title: "match case",
            getType: function () {
                return matchCase ? 'primary' : 'text';
            },
            onClick: function () {
                term._searchAddon.clearDecorations();
                const newMatchCase = !matchCase;
                setMatchCase(m => {
                    return !m;
                });
                term._searchAddon.findPrevious(searchValue, calcSearchOption(newMatchCase, words, regexp));
            }
        }, {
            render: "W",
            title: "words",
            getType: function () {
                return words ? 'primary' : 'text';
            },
            onClick: function () {
                term._searchAddon.clearDecorations();
                const newWords = !words;
                setWords(m => {
                    return !m;
                });
                term._searchAddon.findPrevious(searchValue, calcSearchOption(matchCase, newWords, regexp));
            }
        }, {
            render: "Exp",
            title: "regexp",
            getType: function () {
                return regexp ? 'primary' : 'text';
            },
            onClick: function () {
                term._searchAddon.clearDecorations();
                const newReg = !regexp;
                setRegexp(m => {
                    return !m;
                });
                term._searchAddon.findPrevious(searchValue, calcSearchOption(matchCase, words, newReg));
            }
        }];

    const findButtons = [
        {
            render: <ArrowUpOutlined/>,
            title: "Previous Occurrence",
            onClick: function () {
                term._searchAddon.findPrevious(searchValue, calcSearchOption(matchCase, words, regexp));
            }
        }, {
            render: <ArrowDownOutlined/>,
            title: "Next Occurrence",
            onClick: function () {
                term._searchAddon.findNext(searchValue, calcSearchOption(matchCase, words, regexp));
            }
        }
    ]

    const globalMethodMap = {
        prompt: (msg, callback) => {
            context.prompt(msg, callback);
        },
        createNewSession: (sessionConfs, callback) => {
            const arr = [];
            sessionConfs.forEach(sessionConf => {
                var body;
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
                const newSessionIds = [];
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
                setSessions((sessions) => {
                    const data = [...sessions];
                    for (let i = 0; i < res.length; i++) {
                        const item = res[i];
                        sessionIdMapFileName[item.id] = item.filePath.substr(item.filePath.lastIndexOf('\\') + 1);
                        data.push({
                            label: item.sessionName,
                            key: item.id,
                            sessionConfId: item.filePath,
                            isConnected: true
                        });
                    }

                    const interval = 200;

                    // 创建新会话需要等待所有会话的websocket与后端建立完毕
                    function checkAllSessionIsReady(time) {
                        // 最多等4秒,无法全部执行成功的话就不再执行回调
                        if (time > 4000) {
                            return;
                        }
                        for (let i = 0; i < newSessionIds.length; i++) {
                            if (sessionStatusMap[newSessionIds[i]] !== CONNECTED) {
                                setTimeout(() => {
                                    checkAllSessionIsReady(time + interval);
                                }, interval);
                                return;
                            }
                        }
                        callback && callback(res);
                    }

                    checkAllSessionIsReady(0);
                    return data;
                });
            })
        }
    };

    const closeSearchPanel = (e) => {
        if (e.shiftKey && e.ctrlKey && e.keyCode == 70) {
            setShowSearch((b) => {
                if (!b) {
                    setSearchValue("");
                    setTimeout(() => {
                        searchInputRef?.current?.focus();
                    }, 100);
                } else {
                    term._searchAddon.clearDecorations();
                }
                return !b;
            });
        }
    }

    // 等后端ssh连接建立后再建立websocket连接
    useEffect(async () => {
        if (isConnected) {
            const searchAddon = new SearchAddon();
            term.loadAddon(searchAddon);
            term._searchAddon = searchAddon;
            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term._fitAddon = fitAddon;

            const resizeHandle = () => {
                console.log("resizing....")
                fitAddon.fit();
            };
            window.addEventListener("resize", resizeHandle);

            if (terminalRef.current) {
                terminalRef.current.addEventListener('keydown', closeSearchPanel);
                const resizeObserver = new ResizeObserver(entries => {
                    fitAddon.fit();
                });
                resizeObserver.observe(terminalRef.current);
            }

            var raw_url = await util.getUrl();
            const ws_url = raw_url.split(/\?|#/, 1)[0].replace('http', 'ws'),
                join = (ws_url[ws_url.length - 1] === '/' ? '' : '/'),
                url = ws_url + join + 'ws?id=' + id,
                decoder = window.TextDecoder ? new window.TextDecoder(encoding) : encoding;

            function decode(val) {
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
            sessionStatusMap[id] = CONNECTING;

            sock.onopen = function () {
                // resize_terminal(term);
                sessionStatusMap[id] = CONNECTED;

                function sendTermResizeMessage(cols, rows) {
                    sock.send(JSON.stringify({'type': 'resize', 'resize': [cols, rows]}));
                }

                function termResize(size) {
                    const {cols, rows} = size;
                    sendTermResizeMessage(cols, rows);
                }

                term.onResize(termResize);

                // The following two lines must be placed here so that the term.onResize event can be triggered during initialization.
                term.open(terminalRef.current as HTMLDivElement);
                term.focus();

                fitAddon.fit();
                setTimeout(() => {
                    while (sessionInit[id]?.length) {
                        const f = sessionInit[id].shift();
                        f();
                    }
                }, 100);
            };

            sessionIdRef[id] = {
                id: id,
                sock: sock,
                term: term,
                sessionConfId,
                send: function (msg: object) {
                    sock.send(JSON.stringify(msg));
                },
                sendData: function (data: string) {
                    sock.send(JSON.stringify({'data': data, 'type': 'data'}));
                },
                sendRecv: function (cmd: string, f: Function) {
                    const requestId = getUUid();
                    callbackMap[requestId] = f;
                    sock.send(JSON.stringify({'data': cmd, requestId: requestId, 'type': 'sendRecv'}));
                },
                callback: async function (methodName, args, callback) {
                    const uid = getUUid();
                    callbackMap[uid] = callback;
                    this.send({
                        type: 'recallback',
                        args: args,
                        methodName: methodName,
                        requestId: uid,
                    })
                }
            };

            sock.onerror = function (e) {
                console.error(e);
            };

            term.onData(function (data) {
                sock.send(JSON.stringify({'data': data, 'type': 'data'}));
            });

            function wsockCallback(res) {
                switch (res.type) {
                    case 'data':
                        // 使用TextDecoder将字节序列转换为UTF-8字符串
                        term.write(decode(res.val), (raw) => {
                            if (res.requestId) {
                                sessionIdRef[id].send({
                                    type: 'callback',
                                    requestId: res.requestId,
                                    args: raw
                                })
                            }

                            if (session.logPath) {
                                try {
                                    window.electronAPI.FS_appendFileSync(session.logPath, raw);
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
                            sessionIdRef[id][res.method](res.args, (callbackResponse) => {
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
                            globalMethodMap[res.method](res.args, (callbackResponse) => {
                                sessionIdRef[id].send({
                                    type: 'callback',
                                    requestId: res.requestId,
                                    args: callbackResponse
                                })
                            })
                        } else {
                            globalMethodMap[res.method](res.args);
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

            sessionIdRef[id].sock.onclose = function (e) {
                // console.log(`sock: ${id} closed`, e);
                window.removeEventListener('resize', resizeHandle);
                try {
                    sessionIdRef[id].term.write("\nthis session is closed.....");
                } catch (e) {
                }
                // removeTabByKey(id);
                window.onresize = null;
                delete sessionIdRef[id];
                delete sessionIdMapFileName[id];
                delete sessionStatusMap[id];

                setSessions(sessions => {
                    const data = [...sessions];
                    for (let i = 0; i < data.length; i++) {
                        if (data[i].key == id) {
                            data[i].isConnected = false;
                            break;
                        }
                    }
                    return data;
                })
                // console.log(`sessionIdRef, sessionIdMapFileName, `, sessionIdRef, sessionIdMapFileName)
            };

            sessionIdRef[id].sock.onmessage = function (msg) {
                const res = JSON.parse(msg.data);
                wsockCallback(res);
            };
        }
    }, [isConnected]);

    useEffect(() => {
        setTimeout(() => {
            if (id == activeKey) {
                term.focus();
            }
        }, 100);
    }, [activeKey]);

    function calcSearchOption(matchCase, words, regexp) {
        const res = Object.assign({}, defaultSearchOption);
        if (matchCase) {
            res.caseSensitive = true;
        }
        if (words) {
            res.wholeWord = true;
        }
        if (regexp) {
            res.regex = true;
        }
        return res;
    }

    return (
        <div style={{height: getTermHeight(), display: "flex", flexDirection: 'column'}}>
            <div id={'searchPanel'} style={{
                display: showSearch ? 'flex' : 'none',
                width: '720px',
                alignContent: 'center',
                whiteSpace: 'nowrap'
            }}>
                <Input.TextArea ref={searchInputRef} allowClear={true} autoSize={true} value={searchValue}
                                onChange={(newVal) => {
                                    term._searchAddon.findNext(newVal.target.value, calcSearchOption(matchCase, words, regexp));
                                    setSearchValue(newVal.target.value);
                                }} onKeyDown={closeSearchPanel}/>
                <div style={{backgroundColor: 'white'}}>
                    {
                        matchButtons.map((item, index) => {
                            return <Tooltip title={item.title} color={'white'} overlayInnerStyle={{color: 'black'}}>
                                <Button className={'searchOptions'} type={item.getType()}
                                        style={{height: searchPanelHeight}}
                                        onClick={item.onClick}>{item.render}</Button>
                            </Tooltip>
                        })
                    }

                    {
                        findButtons.map((item) => {
                            return <Tooltip title={item.title} color={'white'} overlayInnerStyle={{color: 'black'}}>
                                <Button className={'searchOptions'} style={{height: searchPanelHeight}}
                                        onClick={item.onClick}>{item.render}</Button>
                            </Tooltip>
                        })
                    }
                </div>
            </div>
            <div style={{flex: "auto", backgroundColor: 'black', overflow: "hidden"}} ref={terminalRef}/>
        </div>
    )
}

// export default React.memo(Xterminal);
export default SessionWindow;
