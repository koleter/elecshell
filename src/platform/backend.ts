import { request } from '@@/plugin-request/request';
import { desktop } from './electronBridge';

let baseUrl: Promise<string> | undefined;

// 并发初始化复用同一个端口请求，HTTP 与 WebSocket 使用同一后端地址。
export function getBackendUrl(): Promise<string> {
    if (!baseUrl) {
        baseUrl = (
            process.env.NODE_ENV === 'development' ? Promise.resolve(8888) : desktop.serverPort()
        )
            .then((port) => `http://localhost:${port}/`)
            .catch((error) => {
                baseUrl = undefined;
                throw error;
            });
    }
    return baseUrl;
}

export function backendRequest<T = any>(uri: string, options: Record<string, unknown>): Promise<T> {
    return getBackendUrl().then((url) => request<T>(url + uri, options));
}
