export type Prompt = (
    title: string,
    onConfirm?: (value: string) => void,
    defaultValue?: string,
    onCancel?: () => void,
) => void;
