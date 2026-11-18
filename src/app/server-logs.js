(() => {
    const english = new URLSearchParams(window.location.search).get('language') === 'en-US';
    const labels = english ? {
        title: 'Server Logs', refresh: 'Refresh', copy: 'Copy', directory: 'Open Log Folder',
        loading: 'Loading logs…', empty: 'No logs yet.', missing: 'Log file not found. Waiting for the server to write logs…',
        error: 'Unable to read logs: ', live: 'Up to 1,000 recent lines · Refreshing every second',
        paused: ' · Scroll to the bottom to follow new logs', truncated: ' · Long log line truncated',
        copied: 'Logs copied', actionError: 'Action failed: ',
    } : {
        title: '服务端日志', refresh: '刷新', copy: '复制', directory: '打开日志目录',
        loading: '正在读取日志…', empty: '暂无日志。', missing: '日志文件尚未生成，等待服务写入…',
        error: '无法读取日志：', live: '最近最多 1000 行 · 每秒自动刷新',
        paused: ' · 滚动到底部继续跟随新日志', truncated: ' · 超长日志行已截断',
        copied: '日志已复制', actionError: '操作失败：',
    };
    const logs = document.getElementById('logs');
    const status = document.getElementById('status');
    const refreshButton = document.getElementById('refresh');
    const copyButton = document.getElementById('copy');
    const directoryButton = document.getElementById('open-directory');
    document.documentElement.lang = english ? 'en' : 'zh-CN';
    document.title = labels.title;
    document.getElementById('heading').textContent = labels.title;
    logs.setAttribute('aria-label', labels.title);
    logs.placeholder = labels.loading;
    refreshButton.textContent = labels.refresh;
    copyButton.textContent = labels.copy;
    directoryButton.textContent = labels.directory;

    let following = true;
    let reading = false;
    let stopped = false;
    let latest = null;
    let actionMessage = '';
    let actionMessageUntil = 0;

    function updateStatus() {
        if (Date.now() < actionMessageUntil) {
            status.textContent = actionMessage;
        } else if (latest) {
            status.textContent = latest.state === 'error' ? labels.error + latest.error
                : latest.state === 'missing' ? labels.missing
                : labels.live + (following ? '' : labels.paused) + (latest.truncated ? labels.truncated : '');
        }
    }

    async function refresh() {
        if (reading || stopped) return;
        reading = true;
        try {
            latest = await window.serverLogs.read();
            if (stopped) return;
            document.getElementById('path').textContent = latest.path;
            document.getElementById('path').title = latest.path;
            // 读取失败时保留上一次内容，便于排查或复制。
            if (latest.state !== 'error' && logs.value !== latest.text) {
                const { scrollTop, scrollLeft, selectionStart, selectionEnd } = logs;
                logs.value = latest.text;
                logs.setSelectionRange(selectionStart, selectionEnd);
                logs.scrollTop = following ? logs.scrollHeight : scrollTop;
                logs.scrollLeft = scrollLeft;
            }
            logs.placeholder = latest.state === 'missing' ? labels.missing
                : latest.state === 'error' ? labels.error + latest.error : labels.empty;
            updateStatus();
        } catch (error) {
            status.textContent = labels.error + error.message;
        } finally {
            reading = false;
        }
    }

    logs.addEventListener('scroll', () => {
        following = logs.scrollHeight - logs.clientHeight - logs.scrollTop < 24;
        updateStatus();
    });
    refreshButton.addEventListener('click', refresh);
    copyButton.addEventListener('click', async () => {
        try {
            await window.serverLogs.copy(logs.value);
            actionMessage = labels.copied;
        } catch (error) {
            actionMessage = labels.actionError + error.message;
        }
        actionMessageUntil = Date.now() + 2500;
        updateStatus();
    });
    directoryButton.addEventListener('click', async () => {
        try {
            const error = await window.serverLogs.openDirectory();
            if (error) throw new Error(error);
        } catch (error) {
            actionMessage = labels.actionError + error.message;
            actionMessageUntil = Date.now() + 5000;
            updateStatus();
        }
    });
    const timer = setInterval(refresh, 1000);
    window.addEventListener('beforeunload', () => {
        stopped = true;
        clearInterval(timer);
    });
    refresh();
})();
