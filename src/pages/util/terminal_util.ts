export function spiltResponseWithLine(res: string) {
    const lines = res.split('\n');
    return lines.slice(1, -1);
}
