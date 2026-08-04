# elecshell 项目说明

## 项目简介

**elecshell** 是一款基于 Electron + React + Python 的 SSH 客户端，目标是提供类似 Xshell / FinalShell / MobaXterm 的终端体验，同时通过本地 Python 脚本扩展自动化能力。

主要能力包括：

- 多标签 SSH 终端会话（支持拖拽排序、拖出窗口成为独立窗口）
- SFTP / 远程中转文件上传下载
- 登录脚本自动执行
- 全局变量管理（密码等敏感信息统一维护）
- 基于 Python 的会话脚本自动化（可发送命令、接收结果、创建新会话等）

## 技术栈

### 前端

- Electron 29
- React 17 + Umi 3.5
- Ant Design Pro / Ant Design 4
- xterm.js（终端渲染）
- TypeScript

### 后端

- Python 3（建议 3.9+）
- Tornado（Web 服务与 WebSocket）
- Paramiko（SSH 连接）
- watchdog / psutil / requests 等辅助库

## 目录结构

```text
elecshell/
├── server/                     # Python 后端
│   ├── handler/                # 请求处理器（WebSocket、配置、脚本等）
│   │   ├── WsockHandler.py     # WebSocket 处理，维护 SSH worker
│   │   ├── ConfigHandler.py    # 配置管理
│   │   └── pojo/
│   │       ├── worker.py       # SSH 会话 worker
│   │       └── SessionContext.py
│   ├── filetransfer/           # SFTP / 远程中转文件传输
│   ├── main.py                 # 后端启动入口
│   └── requirements.txt
├── src/                        # Electron 前端
│   ├── app/                    # 主进程代码
│   │   ├── index.js            # Electron 入口
│   │   └── lib/
│   │       ├── window.js       # 窗口管理
│   │       ├── preload.js      # 预加载脚本
│   │       └── server.js       # 端口管理
│   └── pages/                  # 渲染进程页面
│       └── Session/
│           ├── main/Main.tsx   # 主界面（会话列表、标签页）
│           ├── SessionTab/Xterminal/sessionWindow.tsx  # 终端组件
│           ├── components/SessionDraggableTabs/        # 可拖拽标签
│           └── DetachedSession.tsx                     # 独立窗口会话
├── config/                     # Umi 配置
├── preview/                    # 截图预览
└── package.json
```

## 环境准备

1. 安装 Python 3（建议 3.9+），确保命令行有 `python` 或 `python3`。
2. 安装 Python 依赖：

   ```bash
   cd server
   pip install -r requirements.txt
   ```

3. 安装 Node.js 与 yarn，然后安装前端依赖：

   ```bash
   yarn
   ```

## 开发运行

```bash
# 1. 启动后端
python server/main.py

# 2. 启动前端开发服务
yarn run start

# 3. 启动 Electron
yarn run app
```

## 打包部署

```bash
yarn run build       # 构建前端
yarn run app:build   # 打包 Electron 应用
```

打包产物位于 `build/` 目录。

## 核心设计

### 会话生命周期

- 每个 SSH 会话对应一个 `Worker`（Python 端），以 `sessionId` 为键保存在 `workers` 字典中。
- 前端通过 WebSocket（`/ws?id=<sessionId>`）与 `Worker` 通信。
- 当标签被拖出原窗口时，前端发送 `detach` 消息，后端保留 `Worker`，仅断开当前 WebSocket；新窗口用相同 `sessionId` 重新连接，恢复终端文本并继续通信。

### 脚本系统

- 用户在界面上编写 Python 脚本，入口为 `Main(ctx)`。
- `ctx` 为当前会话上下文，提供 `send`、`recv`、`create_new_session`、`prompt` 等 API。
- 脚本在本地 Python 进程中执行，可调用用户自己安装的任意模块。

## 许可证

个人项目，具体许可证请参考仓库内相关文件。
