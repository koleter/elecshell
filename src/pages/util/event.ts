export function debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout | null;
    return function(...args: any[]) {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
