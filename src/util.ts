import {message} from 'antd';
import {request} from "@@/plugin-request/request";

let port: number;
let url: string;

async function getUrl() {
    if (url) {
        return url;
    }
    if (process.env.NODE_ENV === 'development') {
        port = 8888;
    } else {
        port = await window.electronAPI.ipcRenderer.invoke('request-server-port');
    }
    url = `http://localhost:${port}/`;
    return url;
}

export default {
  baseUrl: async () => {
      return await getUrl()
  },
    getUrl: getUrl,
    request: async (uri: string, options) => {
      return await request(await getUrl() + uri, options);
    }
}

export function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export const callbackMap = {};

export const sessionStatusMap = {};

export function getUUid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0,
      v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function showMessage(res) {
  message[res.status]({
    content: res.content || res.msg
  });
}

export function defineValidatorWithErrMessage(msg) {
  return [() => ({
            validator(e, value) {
              if (value) {
                return Promise.resolve();
              }
              showMessage({
                status: 'error',
                content: msg
              })
              return Promise.reject(new Error());
            },
          }),
    {required: true, message: msg}
        ]
}
