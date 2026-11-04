export interface SessionTreeNode {
    key: string;
    title: string;
    path?: string;
    isLeaf?: boolean;
    encoding?: string;
    children?: SessionTreeNode[];
}

export interface LoginScriptStep {
    id: string;
    expect?: string;
    command?: string;
}

export interface SessionConfiguration {
    key?: string;
    sessionName?: string;
    hostname?: string;
    port?: string | number;
    username?: string;
    password?: string;
    privatekey?: string | { path: string };
    filePath?: string;
    passphrase?: string;
    totp?: string;
    login_script?: LoginScriptStep[];
    title?: string;
}
