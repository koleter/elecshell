import { message } from 'antd';
import type { ReactNode } from 'react';
import type { Notice } from './features/sessions/model/types';

import { backendRequest, getBackendUrl } from './platform/backend';
export { createId as getUUid } from './shared/id';

// 保留其他页面使用的请求入口，具体传输集中在 platform 层。
export default { baseUrl: getBackendUrl, getUrl: getBackendUrl, request: backendRequest };

export function sleep(time: number) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

export function showMessage(res: Notice) {
    const level = (
        ['success', 'info', 'warning', 'error', 'loading'].includes(res.status)
            ? res.status
            : 'error'
    ) as 'success' | 'info' | 'warning' | 'error' | 'loading';
    message[level]({
        content: (res.content || res.msg) as ReactNode,
    });
}

export function defineValidatorWithErrMessage(msg: string) {
    return [
        () => ({
            validator(_rule: unknown, value: unknown) {
                if (value) {
                    return Promise.resolve();
                }
                showMessage({
                    status: 'error',
                    content: msg,
                });
                return Promise.reject(new Error());
            },
        }),
        { required: true, message: msg },
    ];
}
