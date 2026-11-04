export interface ScriptDefinition {
    id: string;
    file: string;
    title: { name: string };
    scriptType: number;
    scriptPath: string;
    strings: string;
    scriptOwner: { isCommon: boolean; owners: string[] };
}
