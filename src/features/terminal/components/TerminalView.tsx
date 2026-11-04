import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';
import { SearchAddon } from 'xterm-addon-search';
import type { ISearchOptions } from 'xterm-addon-search';
import { FitAddon } from 'xterm-addon-fit';
import { SerializeAddon } from 'xterm-addon-serialize';
import { Button, Input, Tooltip } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { ArrowDownOutlined, ArrowUpOutlined, CloseOutlined } from '@ant-design/icons';
import { showMessage } from '../../../util';
import { usePrompt } from '../../dialogs/PromptProvider';
import { useTransferStore } from '../../transfers/model/TransferProvider';
import { useWorkspaceCommands } from '../../workspace/model/WorkspaceProvider';
import { connectSession } from '../../sessions/services/sessionConnection';
import type { TerminalSession } from '../../sessions/model/types';
import type { TerminalPort } from '../../sessions/model/protocol';
import './TerminalView.less';

// 查询框中所有元素的高度
const searchPanelHeight = '34px';

const defaultSearchOption = {
    decorations: {
        matchBackground: 'rgba(255,89,189,0.4)',
        matchBorder: 'rgba(255,89,189,0.4)',
        matchOverviewRuler: 'rgba(255,89,189,0.4)',
        activeMatchBackground: '#A6D2FF',
        activeMatchBorder: '#A6D2FF',
        activeMatchColorOverviewRuler: '#A6D2FF',
    },
};

// 搜索按钮只描述差异，状态切换与查找流程统一处理。
const searchOptionButtons = [
    { key: 'caseSensitive', render: 'Cc', title: 'match case' },
    { key: 'wholeWord', render: 'W', title: 'words' },
    { key: 'regex', render: 'Exp', title: 'regexp' },
] as const;
const findButtons = [
    { method: 'findPrevious', render: <ArrowUpOutlined />, title: 'Previous Occurrence' },
    { method: 'findNext', render: <ArrowDownOutlined />, title: 'Next Occurrence' },
] as const;

const termOptions = {
    rendererType: 'canvas',
    fontSize: 12,
    cursorBlink: true,
    theme: {
        background: 'black',
        foreground: 'white',
        cursor: 'white',
    },
    allowProposedApi: true,
};

type TerminalInstance = Omit<Terminal, 'write'> & {
    write: TerminalPort['write'];
    _searchAddon: SearchAddon;
    _fitAddon?: FitAddon;
    _serializeAddon?: SerializeAddon;
};

// 显示快照用于拖出窗口，与跨进程布局恢复无关。
function serializeTerminal(term: TerminalInstance): string {
    try {
        if (term._serializeAddon) return term._serializeAddon.serialize();
    } catch (error) {
        console.error('serialize term failed', error);
    }
    const lines: string[] = [];
    for (let index = 0; index < term.buffer.active.length; index++) {
        const line = term.buffer.active.getLine(index);
        if (line) lines.push(line.translateToString(true));
    }
    return lines.join('\n');
}

interface TerminalViewProps {
    session: TerminalSession;
    initialContent?: string;
    visible: boolean;
    focused: boolean;
}

// 组件仅负责 xterm 的创建、插件、搜索、尺寸与焦点；连接和协议由会话服务管理。
const TerminalView: React.FC<TerminalViewProps> = ({
    session,
    initialContent,
    visible,
    focused,
}) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<TextAreaRef>(null);
    const commands = useWorkspaceCommands();
    const transfers = useTransferStore();
    const prompt = usePrompt();
    const [showSearch, setShowSearch] = useState(false);
    const [termReady, setTermReady] = useState(false);
    const initialContentWrittenRef = useRef(false);
    const [term] = useState(() => new Terminal(termOptions) as unknown as TerminalInstance);
    const openedRef = useRef(false);
    const visibleRef = useRef(visible);
    const focusedRef = useRef(focused);
    const sessionRef = useRef(session);
    visibleRef.current = visible;
    focusedRef.current = focused;
    sessionRef.current = session;
    const fitFrame = useRef(0);
    const fitTerminal = useCallback(() => {
        // 每帧最多 fit 一次；隐藏或零尺寸容器不参与行列测量。
        cancelAnimationFrame(fitFrame.current);
        fitFrame.current = requestAnimationFrame(() => {
            const element = terminalRef.current;
            if (
                openedRef.current &&
                visibleRef.current &&
                element &&
                element.clientWidth > 0 &&
                element.clientHeight > 0
            )
                term._fitAddon?.fit();
        });
    }, [term]);

    const [searchOptions, setSearchOptions] = useState<ISearchOptions>(defaultSearchOption);

    const [searchValue, setSearchValue] = useState('');

    const toggleSearchOption = (key: (typeof searchOptionButtons)[number]['key']) => {
        const options = { ...searchOptions, [key]: !searchOptions[key] };
        setSearchOptions(options);
        term._searchAddon.clearDecorations();
        term._searchAddon.findPrevious(searchValue, options);
    };

    const closeSearchPanel = () => {
        setShowSearch(false);
        term._searchAddon.clearDecorations();
        term.focus();
    };

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
    };

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

    useEffect(() => {
        if (!session.isConnected) return undefined;
        return connectSession({
            getSession: () => sessionRef.current,
            terminal: term,
            commands,
            transfers,
            prompt,
            notify: showMessage,
            serialize: () => serializeTerminal(term),
            onOpen: () => {
                if (!openedRef.current) {
                    term.open(terminalRef.current!);
                    openedRef.current = true;
                }
                if (visibleRef.current && focusedRef.current) term.focus();
                setTermReady(true);
                fitTerminal();
            },
        });
    }, [
        session.key,
        session.isConnected,
        session.encoding,
        session.sessionConfId,
        term,
        commands,
        transfers,
        prompt,
        fitTerminal,
    ]);

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
        <div
            className="session-terminal"
            onKeyDownCapture={openSearchPanel}
            style={{
                height: '100%',
                minHeight: 0,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div className="session-search-panel" style={{ display: showSearch ? 'flex' : 'none' }}>
                <div className="session-search-fields">
                    <Input.TextArea
                        ref={searchInputRef}
                        allowClear={true}
                        autoSize={true}
                        value={searchValue}
                        style={{ flex: '1 1 120px', minWidth: 0 }}
                        onChange={(newVal) => {
                            term._searchAddon.findNext(newVal.target.value, searchOptions);
                            setSearchValue(newVal.target.value);
                        }}
                    />
                    <div className="session-search-actions">
                        {searchOptionButtons.map((item) => {
                            return (
                                <Tooltip
                                    key={item.title}
                                    title={item.title}
                                    color={'white'}
                                    overlayInnerStyle={{ color: 'black' }}
                                >
                                    <Button
                                        className={'searchOptions'}
                                        type={searchOptions[item.key] ? 'primary' : 'text'}
                                        style={{ height: searchPanelHeight }}
                                        onClick={() => toggleSearchOption(item.key)}
                                    >
                                        {item.render}
                                    </Button>
                                </Tooltip>
                            );
                        })}

                        {findButtons.map((item) => {
                            return (
                                <Tooltip
                                    key={item.title}
                                    title={item.title}
                                    color={'white'}
                                    overlayInnerStyle={{ color: 'black' }}
                                >
                                    <Button
                                        className={'searchOptions'}
                                        style={{ height: searchPanelHeight }}
                                        onClick={() =>
                                            term._searchAddon[item.method](
                                                searchValue,
                                                searchOptions,
                                            )
                                        }
                                    >
                                        {item.render}
                                    </Button>
                                </Tooltip>
                            );
                        })}
                    </div>
                </div>
                <Button
                    type="text"
                    size="small"
                    aria-label="Close search"
                    icon={<CloseOutlined />}
                    onClick={closeSearchPanel}
                />
            </div>

            <div
                style={{
                    flex: '1 1 0',
                    minWidth: 0,
                    minHeight: 0,
                    backgroundColor: 'black',
                    overflow: 'hidden',
                }}
                ref={terminalRef}
            />
        </div>
    );
};

export default React.memo(TerminalView);
