const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { randomUUID } = require('crypto');

// 指针由源窗口捕获，目标窗口不会收到 DOM pointermove；主进程按屏幕坐标转发落点。
const receivers = new Set();
const pending = new Map();
const reservations = new Map();
let sequence = 0;
let drag = null;
let timer = null;
let hovered = null;
let lastPoint = null;
const frontToBack = [];

app.on('browser-window-focus', (_event, win) => {
    const index = frontToBack.indexOf(win.id);
    if (index >= 0) frontToBack.splice(index, 1);
    frontToBack.unshift(win.id);
});

function send(receiver, channel, value) {
    if (!receiver || receiver.isDestroyed()) return;
    receiver.send(channel, value);
}

function clearDrag() {
    clearInterval(timer);
    timer = null;
    drag = null;
    send(hovered, 'session-drag-hover', null);
    hovered = null;
    lastPoint = null;
}

function windowAtCursor() {
    const point = screen.getCursorScreenPoint();
    const windows = BrowserWindow.getAllWindows().filter(
        (win) =>
            !win.isDestroyed() &&
            win.isVisible() &&
            !win.isMinimized() &&
            receivers.has(win.webContents.id),
    );
    windows.sort((first, second) => {
        const rank = (win) => {
            const index = frontToBack.indexOf(win.id);
            return index < 0 ? frontToBack.length : index;
        };
        return rank(first) - rank(second);
    });
    for (const win of windows) {
        const bounds = win.getContentBounds();
        if (
            point.x >= bounds.x &&
            point.x < bounds.x + bounds.width &&
            point.y >= bounds.y &&
            point.y < bounds.y + bounds.height
        ) {
            const zoom = win.webContents.getZoomFactor();
            return {
                receiver: win.webContents,
                point: {
                    x: (point.x - bounds.x) / zoom,
                    y: (point.y - bounds.y) / zoom,
                },
            };
        }
    }
    return null;
}

function updateHover() {
    if (!drag) return;
    const hit = windowAtCursor();
    const receiver = hit && hit.receiver !== drag.source ? hit.receiver : null;
    if (hovered !== receiver) {
        send(hovered, 'session-drag-hover', null);
        hovered = receiver;
        lastPoint = null;
    }
    if (receiver && (!lastPoint || lastPoint.x !== hit.point.x || lastPoint.y !== hit.point.y)) {
        lastPoint = hit.point;
        send(receiver, 'session-drag-hover', hit.point);
    }
}

function request(receiver, channel, payload) {
    if (receiver.isDestroyed() || !receivers.has(receiver.id)) return Promise.resolve(false);
    return new Promise((resolve) => {
        const requestId = ++sequence;
        const finish = (accepted) => {
            clearTimeout(timeout);
            receiver.removeListener('destroyed', closed);
            pending.delete(requestId);
            resolve(accepted);
        };
        const closed = () => finish(false);
        const timeout = setTimeout(closed, 3000);
        pending.set(requestId, { receiver, finish });
        receiver.once('destroyed', closed);
        send(receiver, channel, { ...payload, requestId });
    });
}

ipcMain.on('session-drag-reply', (event, requestId, accepted) => {
    const entry = pending.get(requestId);
    if (entry?.receiver === event.sender) entry.finish(accepted === true);
});

ipcMain.on('session-drag-register', (event) => {
    if (receivers.has(event.sender.id)) return;
    receivers.add(event.sender.id);
    event.sender.once('destroyed', () => {
        receivers.delete(event.sender.id);
        if (drag?.source === event.sender) clearDrag();
    });
});
ipcMain.on('session-drag-unregister', (event) => receivers.delete(event.sender.id));

ipcMain.handle('session-drag-start', (event, sessionId) => {
    if (!receivers.has(event.sender.id) || typeof sessionId !== 'string') return;
    clearDrag();
    drag = { source: event.sender, sessionId };
    updateHover();
    timer = setInterval(updateHover, 16);
});
ipcMain.handle('session-drag-cancel', (event) => {
    if (drag?.source === event.sender) clearDrag();
});

ipcMain.handle('session-drag-finish', async (event) => {
    if (drag?.source !== event.sender) return { kind: 'blocked' };
    const { source, sessionId } = drag;
    const hit = windowAtCursor();
    clearDrag();
    if (!hit) return { kind: 'outside' };
    if (hit.receiver === source) return { kind: 'local', point: hit.point };
    const accepted = await request(hit.receiver, 'session-drag-probe', {
        point: hit.point,
        sessionId,
    });
    if (!accepted || source.isDestroyed()) return { kind: 'blocked' };
    const token = randomUUID();
    const expiry = setTimeout(() => reservations.delete(token), 10000);
    reservations.set(token, { ...hit, source, sessionId, expiry });
    return { kind: 'window', token };
});

ipcMain.handle('session-drag-commit', async (event, payload) => {
    const entry = reservations.get(payload?.token);
    if (!entry || entry.source !== event.sender || payload.session?.key !== entry.sessionId)
        throw new Error('Session drop is no longer available');
    clearTimeout(entry.expiry);
    reservations.delete(payload.token);
    const accepted = await request(entry.receiver, 'session-drag-receive', {
        point: entry.point,
        sessionId: entry.sessionId,
        session: payload.session,
        content: payload.content,
    });
    if (!accepted) throw new Error('The destination window could not receive the session');
    const win = BrowserWindow.fromWebContents(entry.receiver);
    if (win && !win.isDestroyed()) {
        win.show();
        win.focus();
    }
});
