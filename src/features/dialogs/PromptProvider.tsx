import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Input, Modal } from 'antd';
import type { InputRef } from 'antd';
import type { Prompt } from './types';

const PromptContext = createContext<Prompt | null>(null);

// 弹窗输入留在独立组件中，输入每个字符时不会重新渲染工作区或终端。
export const PromptProvider: React.FC = ({ children }) => {
    const [dialog, setDialog] = useState<{ id: number; title: string; value: string } | null>(null);
    const nextId = useRef(0);
    const callbacks = useRef<{ confirm?: (value: string) => void; cancel?: () => void }>({});
    const input = useRef<InputRef>(null);
    const prompt: Prompt = useCallback((title, confirm, value = '', cancel) => {
        callbacks.current = { confirm, cancel };
        nextId.current += 1;
        setDialog({ id: nextId.current, title, value });
    }, []);
    const isOpen = !!dialog;
    const dialogId = dialog?.id;
    useEffect(() => {
        // 连续脚本弹窗也能重新聚焦；输入字符时保持当前焦点和选区。
        if (!dialogId) return undefined;
        const frame = requestAnimationFrame(() => input.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, [dialogId]);
    const close = (confirm: boolean) => {
        if (!dialog) return;
        const callback = callbacks.current;
        callbacks.current = {};
        setDialog(null);
        if (confirm) callback.confirm?.(dialog.value);
        else callback.cancel?.();
    };
    return (
        <PromptContext.Provider value={prompt}>
            {children}
            <Modal
                width={800}
                title={dialog?.title}
                open={isOpen}
                maskClosable={false}
                closable={false}
                onOk={() => close(true)}
                onCancel={() => close(false)}
            >
                <Input
                    ref={input}
                    allowClear
                    value={dialog?.value || ''}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') close(true);
                    }}
                    onChange={(event) =>
                        setDialog(
                            (previous) => previous && { ...previous, value: event.target.value },
                        )
                    }
                />
            </Modal>
        </PromptContext.Provider>
    );
};
export function usePrompt() {
    const prompt = useContext(PromptContext);
    if (!prompt) throw new Error('PromptProvider is required');
    return prompt;
}
