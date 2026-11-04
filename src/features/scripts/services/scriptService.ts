import { backendRequest } from '../../../platform/backend';
import type { ApiResult } from '../../../platform/types';
import type { ScriptDefinition } from '../model/types';

type ScriptOperation =
    | { type: 'deleteFile'; path: string }
    | { type: 'addFile'; content: string }
    | ({ type: 'editScript' } & Partial<ScriptDefinition>);
export const scriptService = {
    load: () =>
        backendRequest<ApiResult & { scriptData?: ScriptDefinition[] }>('conf', {
            method: 'GET',
            params: { type: 'ScriptConfig' },
        }),
    update: (operation: ScriptOperation) =>
        backendRequest<ApiResult>('conf', {
            method: 'POST',
            body: JSON.stringify({ type: 'ScriptConfig', args: operation }),
        }),
};
