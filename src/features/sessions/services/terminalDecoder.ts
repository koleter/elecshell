function decodeBase64(value: string): Uint8Array {
    const raw = atob(value);
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

/** 每个连接独立持有解码器，显示流、隐藏流和独立响应互不影响。 */
export class TerminalDecoder {
    private readonly visibleDecoder: TextDecoder;
    private readonly hiddenDecoder: TextDecoder;

    constructor(encoding?: string) {
        this.visibleDecoder = new TextDecoder(encoding);
        this.hiddenDecoder = new TextDecoder(this.visibleDecoder.encoding);
    }

    decodeData(value: string, showOnTerm: boolean = true): string | Uint8Array {
        const bytes = decodeBase64(value);
        // UTF-8 交给 xterm 原生解码器处理，以保留跨包的多字节字符。
        if (this.visibleDecoder.encoding === 'utf-8') return bytes;
        const decoder = showOnTerm ? this.visibleDecoder : this.hiddenDecoder;
        return decoder.decode(bytes, { stream: true });
    }

    decodeResponse(value: string): string {
        return new TextDecoder(this.visibleDecoder.encoding).decode(decodeBase64(value));
    }
}
