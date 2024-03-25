import {useEffect, useRef, useContext, useState} from "react";
import React from "react";
import {Terminal} from "xterm"
import "xterm/css/xterm.css"
import util, {sleep, msgMap, sessionStatusMap, showMessage, getUUid} from "../../../../util"
import {DISCONNECTED, CONNECTING, CONNECTED, HEADER_HEIGHT} from "../../../../const"
import {sessionIdRef, sessionIdMapFileName} from "../../main/Main"
import {SearchAddon} from 'xterm-addon-search'
import {FitAddon} from 'xterm-addon-fit'
import {request} from 'umi';
import "./SessionWindow.less"
import {sessionConfInfo} from "@/pages/Session/SessionList/SessionList";
import {AppContext} from "@/pages/context/AppContextProvider";

const termOptions = {
    rendererType: "canvas",
    fontSize: 12,
    cursorBlink: true,
    theme: {
        background: 'black',
        foreground: 'white',
        cursor: 'white'
    }
};

const SessionWindow: React.FC = (props) => {
    const terminalRef = useRef<null | HTMLDivElement>(null);
    const {id, sessionConfId, setSessions, isConnected} = props;
    const context = useContext(AppContext);
    const {} = context;

    const [term] = useState(new Terminal(termOptions));

    const methodMap = {
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
                arr.push(request(util.baseUrl + "session", {
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

    // 等后端ssh连接建立后再建立websocket连接
    useEffect(() => {
        if (isConnected) {
            const searchAddon = new SearchAddon();
            term.loadAddon(searchAddon);
            const fitAddon = new FitAddon();
            term.loadAddon(fitAddon);
            term._fitAddon = fitAddon;
            term.open(terminalRef.current as HTMLDivElement);
            term.focus();

            const ws_url = util.baseUrl.split(/\?|#/, 1)[0].replace('http', 'ws'),
                join = (ws_url[ws_url.length - 1] === '/' ? '' : '/'),
                url = ws_url + join + 'ws?id=' + id,
                encoding = 'utf-8',
                decoder = window.TextDecoder ? new window.TextDecoder(encoding) : encoding;

            const sock = new window.WebSocket(url);
            sessionStatusMap[id] = CONNECTING;

            sock.onopen = function () {
                // resize_terminal(term);
                sessionStatusMap[id] = CONNECTED;
                function sendTermResizeMessage(cols, rows) {
                    sock.send(JSON.stringify({'type': 'resize', 'resize': [cols, rows]}));
                }

                function termResize(size) {
                    term._fitAddon.fit();
                    const {cols, rows} = size;
                    sendTermResizeMessage(cols, rows);
                }

                term.onResize(termResize);

                window.addEventListener("resize", () => {
                    fitAddon.fit();
                });

                term._fitAddon.fit();
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
                sendRecv: async function (data: string, maxRetryCount = 10, retryTime = 1000) {
                    const uid = getUUid();
                    console.log(`uuid: ${uid}`)

                    sock.send(JSON.stringify({'data': data + '\r', requestId: uid, 'type': 'sendRecv'}));
                    for (let i = 0; i < maxRetryCount; i++) {
                        console.log('msgMap:', msgMap)
                        if (uid in msgMap) {
                            const msg = msgMap[uid];
                            delete msgMap[uid];
                            return msg
                        }
                        await sleep(retryTime);
                    }
                    return {
                        error: 'excced time'
                    }
                }
            };

            sock.onerror = function (e) {
                console.error(e);
            };

            term.onData(function (data) {
                console.log(`onData: ${id}, data: ${data}`);
                sock.send(JSON.stringify({'data': data, 'type': 'data'}));
            });

            function term_write(text) {
                sessionIdRef[id].term.write(text);
            }

            function wsockCallback(res) {
                switch (res.type) {
                    case 'data':
                        term_write(res.val);
                        break;
                    case 'message':
                        showMessage(res);
                        break;
                    case 'execMethod':
                        if (res.requestId) {
                            methodMap[res.method](res.args, (callbackResponse) => {
                                sessionIdRef[id].send({
                                    type: 'callback',
                                    requestId: res.requestId,
                                    args: callbackResponse
                                })
                            })
                        } else {
                            methodMap[res.method](res.args);
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
                        console.log(res);
                        if (res.val) {
                            msgMap[res.requestId] = res.val;
                        }
                        console.log(msgMap)
                        break;
                    default:
                        throw new Error(`unexpected result type: ${res.type}`);
                }
            }

            sessionIdRef[id].sock.onclose = function (e) {
                console.log(`sock: ${id} closed`, e);
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

    return (
        <div style={{height: `calc(100vh - ${HEADER_HEIGHT}px - 40px)`, backgroundColor: 'black'}} ref={terminalRef}></div>
    )
}

// export default React.memo(Xterminal);
export default SessionWindow;
