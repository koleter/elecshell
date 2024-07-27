export function fileSep() {
    if (window.electronAPI.platform == "win32") {
        return "\\";
    }
    return "/";
}
