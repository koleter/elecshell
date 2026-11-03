// 运行时按会话 ID 归属于当前窗口，与布局树独立，跨分屏移动时继续复用。
// 文件名供脚本/文件传输使用；实例表存放终端、WebSocket 及会话方法，仅驻留内存。
export const sessionIdMapFileName: Record<string, string> = {};
export const sessionIdRef: Record<string, any> = {};

// 配置 ID 到文件路径的共享索引；放在独立模块中，避免终端、侧边栏和脚本互相导入页面。
export const sessionConfInfo: Record<string, string> = {};
