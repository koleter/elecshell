export interface ApiResult<T = unknown> {
    status: string;
    msg?: string;
    content?: string;
    data: T;
}
