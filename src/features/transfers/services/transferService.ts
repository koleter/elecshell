interface DragDownload {
    sessionId: string;
    directory: string;
    files: readonly string[];
    singleFile: boolean;
}

// 下载协议在服务层生成；浏览器拖放时只设置 payload，不提前读取或传输文件内容。
export function dragDownloadPayload(baseUrl: string, options: DragDownload): string {
    const params = new URLSearchParams({
        sessionId: options.sessionId,
        remoteDir: options.directory,
        files: JSON.stringify(options.files),
    });
    const fileName =
        options.singleFile && options.files.length === 1
            ? options.files[0].replace(/:/g, '_')
            : `elecshell_${options.files.length}_files.tar.gz`;
    return `application/octet-stream:${fileName}:${baseUrl}dragdownload?${params.toString()}`;
}
