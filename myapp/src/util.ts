import {message} from 'antd';

export default {
  baseUrl: "http://localhost:8888/"
}

export function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

export const msgMap = {};

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
    content: res.content
  })
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
