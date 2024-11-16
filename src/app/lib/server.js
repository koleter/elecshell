const net = require('net');
const { app, BrowserWindow, ipcMain } = require('electron');

let port;

function getRandomPort() {
    return new Promise((resolve, reject) => {
        // 创建一个 TCP 服务器
        const server = net.createServer((socket) => {});

        // 服务器开始监听某个端口
        server.listen(0, () => {
            // 监听端口时指定了端口号为 0，表示自动选择一个可用端口
            port = server.address().port;
            server.close((err) => {
                resolve(port);
            }); // 关闭服务器，释放端口
        });
    });
}

const _getServerPort = async () => {
    if (port) {
        return port; // 如果端口已缓存，则直接返回
    }

    if (process.env.NODE_ENV === 'development') {
        port = 8888;
        return port;
    }

    await getRandomPort();

    return port;
};

exports.getServerPort = _getServerPort;

// 监听来自渲染进程的请求
ipcMain.handle('request-server-port', async (event) => {
    return port;
});

// exports.getServerPort = () => {
//     if (port) {
//         return Promise.resolve(port);  // 如果已经有端口，直接返回
//     }
//
//     return new Promise((resolve, reject) => {
//         // 创建一个 TCP 服务器
//         const server = net.createServer((socket) => {});
//
//         // 服务器开始监听某个端口
//         server.listen(0, () => {
//             // 监听端口时指定了端口号为 0，表示自动选择一个可用端口
//             port = server.address().port;
//             resolve(port);  // 监听成功后返回端口号
//         });
//
//         // 错误处理
//         server.on('error', (err) => {
//             reject(err);  // 如果监听失败，返回错误
//         });
//     });
// };
