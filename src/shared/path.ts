import { desktop } from '@/platform/electronBridge';
export function fileSep() {
    if (desktop.platform == 'win32') {
        return '\\';
    }
    return '/';
}
