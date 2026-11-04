import { backendRequest } from '../../../platform/backend';
import type { ApiResult } from '../../../platform/types';
import type { VariableItem } from '../model/types';

interface ProjectConfiguration {
    namespace: string;
    language?: string;
}
interface VariablesConfiguration {
    strVariableSetting?: VariableItem[];
}
type VariableScope = 'ConfigableProjectConfig' | 'GlobalVariableConfig';
type NamespaceOperation =
    | { type: 'create'; namespace: string }
    | { type: 'import'; namespace: string; directoryPath: string; force: boolean }
    | { type: 'export'; namespace: string; directoryPath: string };

export const settingsService = {
    loadShell: () =>
        backendRequest<ApiResult<{ xshListWindowWidth?: number }>>('conf', {
            method: 'GET',
            params: { type: 'GlobalAutoConfig' },
        }),
    saveSidebarWidth: (width: number) =>
        backendRequest<ApiResult>('conf', {
            method: 'POST',
            body: JSON.stringify({ type: 'GlobalAutoConfig', args: { xshListWindowWidth: width } }),
        }),
    loadProject: () =>
        backendRequest<ApiResult<ProjectConfiguration>>('conf', {
            method: 'GET',
            params: { type: 'ProjectConfig' },
        }),
    saveProject: (configuration: Partial<ProjectConfiguration>) =>
        backendRequest<ApiResult>('conf', {
            method: 'POST',
            body: JSON.stringify({ type: 'ProjectConfig', args: configuration }),
        }),
    loadVariables: (scope: VariableScope) =>
        backendRequest<ApiResult<VariablesConfiguration>>('conf', {
            method: 'GET',
            params: { type: scope },
        }),
    saveVariables: (scope: VariableScope, variables: VariableItem[]) =>
        backendRequest<ApiResult>('conf', {
            method: 'POST',
            body: JSON.stringify({ type: scope, args: { strVariableSetting: variables } }),
        }),
    listNamespaces: () => backendRequest<string[]>('namespace', { method: 'GET' }),
    updateNamespace: (operation: NamespaceOperation) =>
        backendRequest<ApiResult>('namespace', { method: 'POST', body: JSON.stringify(operation) }),
    deleteNamespace: (namespace: string) =>
        backendRequest<ApiResult>('namespace', {
            method: 'DELETE',
            body: JSON.stringify({ namespace }),
        }),
};
