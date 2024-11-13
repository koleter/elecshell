import {HEADER_HEIGHT} from "@/const";

export function getTermHeight() {
    if (window.electronAPI.platform != 'win32') {
        return `calc(100vh - ${HEADER_HEIGHT}px  - 40px)`;
    }
    return `calc(100vh - 40px)`;
}
