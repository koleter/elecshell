import type { TerminalSession } from '../../sessions/model/types';

/** 布局树的叶子节点，对应一组标签及其中当前可见的会话。 */
export interface TabGroup {
    type: 'group';
    id: string;
    tabs: string[];
    activeTabId: string | null;
}

/** 内部节点始终切分为两部分；递归组合即可支持任意层级的分屏。 */
export interface SplitNode {
    type: 'split';
    id: string;
    axis: 'x' | 'y'; // x 为左右分屏，y 为上下分屏。
    ratio: number; // 第一个子节点占可用空间的比例，不包含分隔条宽度。
    children: [LayoutNode, LayoutNode];
}

export type LayoutNode = TabGroup | SplitNode;
export type DropPosition = 'tabs' | 'center' | 'left' | 'right' | 'top' | 'bottom';

export interface WorkspaceState {
    sessions: TerminalSession[];
    root: LayoutNode;
    focusedGroupId: string;
    maximizedGroupId: string | null;
}

export type WorkspaceAction =
    | {
          type: 'sessions';
          update: TerminalSession[] | ((previous: TerminalSession[]) => TerminalSession[]);
      }
    | { type: 'activate'; sessionId: string }
    | { type: 'focus'; groupId: string }
    | { type: 'move'; sessionId: string; groupId: string; position: DropPosition; index?: number }
    | { type: 'resize'; splitId: string; ratio: number }
    | { type: 'maximize'; groupId: string };

let sequence = 0;
function nodeId() {
    sequence += 1;
    return `pane-${Date.now().toString(36)}-${sequence}`;
}

function newGroup(tabs: string[] = []): TabGroup {
    return { type: 'group', id: nodeId(), tabs, activeTabId: tabs[0] || null };
}

export function getGroups(node: LayoutNode): TabGroup[] {
    return node.type === 'group' ? [node] : node.children.flatMap(getGroups);
}

export function getFocusedSession(state: WorkspaceState): string {
    return (
        getGroups(state.root).find((group) => group.id === state.focusedGroupId)?.activeTabId || ''
    );
}

// 只复制发生变化的分支，保留其余节点的引用，避免无关布局重新计算。
function replaceNode(
    node: LayoutNode,
    id: string,
    replacement: (node: LayoutNode) => LayoutNode,
): LayoutNode {
    if (node.id === id) return replacement(node);
    if (node.type === 'group') return node;
    const children = node.children.map((child) =>
        replaceNode(child, id, replacement),
    ) as SplitNode['children'];
    return children.every((child, index) => child === node.children[index])
        ? node
        : { ...node, children };
}

function updateGroup(
    node: LayoutNode,
    id: string,
    update: (group: TabGroup) => TabGroup,
): LayoutNode {
    return replaceNode(node, id, (current) =>
        current.type === 'group' ? update(current) : current,
    );
}

/** 移除标签并逐层收起新产生的空分支；返回 null 表示整个子树已清空。 */
function removeTabs(node: LayoutNode, removed: Set<string>): LayoutNode | null {
    if (node.type === 'split') {
        const first = removeTabs(node.children[0], removed);
        const second = removeTabs(node.children[1], removed);
        if (!first) return second;
        if (!second) return first;
        return first === node.children[0] && second === node.children[1]
            ? node
            : { ...node, children: [first, second] };
    }
    const tabs = node.tabs.filter((id) => !removed.has(id));
    if (tabs.length === node.tabs.length) return node;
    if (!tabs.length) return null;
    const oldIndex = node.tabs.indexOf(node.activeTabId || '');
    return {
        ...node,
        tabs,
        activeTabId: tabs.includes(node.activeTabId || '')
            ? node.activeTabId
            : tabs[Math.max(0, oldIndex - 1)] || tabs[0],
    };
}

// 分屏合并或关闭后，焦点与最大化目标不能继续指向已被移除的节点。
function repairFocus(state: WorkspaceState): WorkspaceState {
    const groups = getGroups(state.root);
    const focused =
        groups.find((group) => group.id === state.focusedGroupId) ||
        groups.find((group) => group.tabs.length) ||
        groups[0];
    return {
        ...state,
        focusedGroupId: focused.id,
        maximizedGroupId:
            groups.some((group) => group.id === state.maximizedGroupId) && groups.length > 1
                ? state.maximizedGroupId
                : null,
    };
}

function syncSessions(state: WorkspaceState, sessions: TerminalSession[]): WorkspaceState {
    if (sessions === state.sessions) return state;
    // 关闭全部会话后重置布局，确保下一次连接占满工作区。
    if (!sessions.length) {
        const root =
            state.root.type === 'group' && !state.root.tabs.length ? state.root : newGroup();
        return { ...state, sessions, root, focusedGroupId: root.id, maximizedGroupId: null };
    }
    const existing = new Set(sessions.map((session) => session.key));
    const removed = new Set(
        state.sessions
            .filter((session) => !existing.has(session.key))
            .map((session) => session.key),
    );
    let root = removed.size ? removeTabs(state.root, removed) || newGroup() : state.root;
    const previous = new Set(state.sessions.map((session) => session.key));
    const added = sessions.filter((session) => !previous.has(session.key));
    // 标题、日志路径和连接状态更新只替换会话数据，不遍历或重建布局树。
    if (!removed.size && !added.length) return { ...state, sessions };
    if (added.length) {
        const groups = getGroups(root);
        // 新会话默认加入当前焦点组；焦点组已关闭时退回第一个有效分组。
        const destination = groups.find((group) => group.id === state.focusedGroupId) || groups[0];
        root = updateGroup(root, destination.id, (group) => ({
            ...group,
            tabs: [...group.tabs, ...added.map((session) => session.key)],
            activeTabId: group.activeTabId || added[0].key,
        }));
    }
    return repairFocus({ ...state, sessions, root });
}

export function createWorkspace(sessions: TerminalSession[] = []): WorkspaceState {
    // 每次创建工作区都生成一个新标签组，不继承其他窗口或上次运行的分屏状态。
    const root = newGroup();
    return syncSessions(
        { sessions: [], root, focusedGroupId: root.id, maximizedGroupId: null },
        sessions,
    );
}

/** 统一处理布局变更；WebSocket、终端实例和窗口 IPC 均由外层管理。 */
export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
    switch (action.type) {
        case 'sessions':
            return syncSessions(
                state,
                typeof action.update === 'function' ? action.update(state.sessions) : action.update,
            );
        case 'activate': {
            const group = getGroups(state.root).find((item) =>
                item.tabs.includes(action.sessionId),
            );
            if (!group) return state;
            if (group.activeTabId === action.sessionId && state.focusedGroupId === group.id)
                return state;
            return {
                ...state,
                root: updateGroup(state.root, group.id, (item) => ({
                    ...item,
                    activeTabId: action.sessionId,
                })),
                focusedGroupId: group.id,
                maximizedGroupId: state.maximizedGroupId ? group.id : null,
            };
        }
        case 'focus':
            return state.focusedGroupId !== action.groupId &&
                getGroups(state.root).some((group) => group.id === action.groupId)
                ? {
                      ...state,
                      focusedGroupId: action.groupId,
                      maximizedGroupId: state.maximizedGroupId ? action.groupId : null,
                  }
                : state;
        case 'move': {
            const groups = getGroups(state.root);
            const source = groups.find((group) => group.tabs.includes(action.sessionId));
            const target = groups.find((group) => group.id === action.groupId);
            if (!source || !target) return state;
            const split = action.position !== 'tabs' && action.position !== 'center';
            if (source.id === target.id && split && source.tabs.length === 1) return state;
            if (source.id === target.id && action.position === 'center') {
                return workspaceReducer(state, { type: 'activate', sessionId: action.sessionId });
            }
            if (source.id === target.id && action.position === 'tabs') {
                const from = source.tabs.indexOf(action.sessionId);
                const index = action.index === undefined ? source.tabs.length : action.index;
                const tabs = source.tabs.filter((id) => id !== action.sessionId);
                // 插入位置来自移除前的标签列表，向右移动时需减去源标签占用的位置。
                tabs.splice(
                    Math.max(0, Math.min(tabs.length, index > from ? index - 1 : index)),
                    0,
                    action.sessionId,
                );
                return {
                    ...state,
                    root: updateGroup(state.root, source.id, (group) => ({
                        ...group,
                        tabs,
                        activeTabId: action.sessionId,
                    })),
                    focusedGroupId: source.id,
                };
            }
            // 先移走源标签并收起空组，再在目标组旁切分或插入，防止留下空白分屏。
            let root = removeTabs(state.root, new Set([action.sessionId]));
            if (!root) return state;
            let focusedGroupId = target.id;
            if (split) {
                const added = newGroup([action.sessionId]);
                focusedGroupId = added.id;
                root = replaceNode(root, target.id, (current) => ({
                    type: 'split',
                    id: nodeId(),
                    axis: action.position === 'left' || action.position === 'right' ? 'x' : 'y',
                    ratio: 0.5,
                    children:
                        action.position === 'left' || action.position === 'top'
                            ? [added, current]
                            : [current, added],
                }));
            } else {
                root = updateGroup(root, target.id, (group) => {
                    const tabs = [...group.tabs];
                    tabs.splice(
                        Math.max(0, Math.min(tabs.length, action.index ?? tabs.length)),
                        0,
                        action.sessionId,
                    );
                    return { ...group, tabs, activeTabId: action.sessionId };
                });
            }
            return repairFocus({ ...state, root, focusedGroupId, maximizedGroupId: null });
        }
        case 'resize':
            return Number.isFinite(action.ratio)
                ? {
                      ...state,
                      root: replaceNode(state.root, action.splitId, (node) =>
                          node.type === 'split'
                              ? { ...node, ratio: Math.max(0.01, Math.min(0.99, action.ratio)) }
                              : node,
                      ),
                  }
                : state;
        case 'maximize':
            return getGroups(state.root).length > 1 &&
                getGroups(state.root).some((group) => group.id === action.groupId)
                ? {
                      ...state,
                      focusedGroupId: action.groupId,
                      maximizedGroupId:
                          state.maximizedGroupId === action.groupId ? null : action.groupId,
                  }
                : state;
        default:
            return state;
    }
}

export const TAB_BAR_HEIGHT = 40;
export const SPLITTER_SIZE = 5;
export const MIN_PANE_WIDTH = 240;
export const MIN_PANE_HEIGHT = 140;

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface PaneRect extends Rect {
    group: TabGroup;
}
export interface SplitterRect extends Rect {
    node: SplitNode;
    container: Rect;
}

/** 向上累加子树的最小尺寸，为嵌套分屏的比例约束提供依据。 */
export function minimumSize(node: LayoutNode): { width: number; height: number } {
    if (node.type === 'group') return { width: MIN_PANE_WIDTH, height: MIN_PANE_HEIGHT };
    const first = minimumSize(node.children[0]);
    const second = minimumSize(node.children[1]);
    return node.axis === 'x'
        ? {
              width: first.width + second.width + SPLITTER_SIZE,
              height: Math.max(first.height, second.height),
          }
        : {
              width: Math.max(first.width, second.width),
              height: first.height + second.height + SPLITTER_SIZE,
          };
}

export function constrainRatio(node: SplitNode, container: Rect, ratio: number): number {
    const dimension = node.axis === 'x' ? 'width' : 'height';
    const available = Math.max(0, container[dimension] - SPLITTER_SIZE);
    const first = minimumSize(node.children[0])[dimension];
    const second = minimumSize(node.children[1])[dimension];
    // 窗口缩到不足以满足最小尺寸时按需求比例分配，避免产生负尺寸或无效坐标。
    if (available < first + second) return first / (first + second);
    return Math.max(first / available, Math.min(1 - second / available, ratio));
}

/** 将布局树展开为工作区内的绝对坐标；最大化只改变测量结果，不改动原树。 */
export function measureLayout(
    root: LayoutNode,
    bounds: Rect,
    maximizedGroupId: string | null = null,
) {
    const panes: PaneRect[] = [];
    const splitters: SplitterRect[] = [];
    const visit = (node: LayoutNode, rect: Rect) => {
        if (node.type === 'group') {
            panes.push({ ...rect, group: node });
            return;
        }
        const horizontal = node.axis === 'x';
        const available = Math.max(0, (horizontal ? rect.width : rect.height) - SPLITTER_SIZE);
        const first = available * constrainRatio(node, rect, node.ratio);
        visit(node.children[0], { ...rect, [horizontal ? 'width' : 'height']: first });
        splitters.push({
            ...rect,
            node,
            container: rect,
            x: rect.x + (horizontal ? first : 0),
            y: rect.y + (horizontal ? 0 : first),
            width: horizontal ? SPLITTER_SIZE : rect.width,
            height: horizontal ? rect.height : SPLITTER_SIZE,
        });
        visit(node.children[1], {
            ...rect,
            x: rect.x + (horizontal ? first + SPLITTER_SIZE : 0),
            y: rect.y + (horizontal ? 0 : first + SPLITTER_SIZE),
            [horizontal ? 'width' : 'height']: available - first,
        });
    };
    const maximized =
        maximizedGroupId && getGroups(root).find((group) => group.id === maximizedGroupId);
    visit(maximized || root, bounds);
    return { panes, splitters };
}

export function splitDestination(
    state: WorkspaceState,
    sessionId: string,
    groupId: string,
    bounds: Rect,
): PaneRect | null {
    // 源组清空后目标区域可能扩大，先测量这一中间布局再判断能否继续切分。
    // 最大化时也使用原布局的实际尺寸，避免退出最大化后分屏过小。
    const remaining = removeTabs(state.root, new Set([sessionId]));
    return remaining
        ? measureLayout(remaining, bounds).panes.find((pane) => pane.group.id === groupId) || null
        : null;
}

export function dropPosition(point: { x: number; y: number }, pane: Rect): DropPosition {
    // 标签栏优先用于排序；上下分屏的触发范围只计算下面的终端内容区。
    if (point.y < pane.y + TAB_BAR_HEIGHT) return 'tabs';
    const width = Math.max(1, pane.width);
    const contentHeight = Math.max(1, pane.height - TAB_BAR_HEIGHT);
    // 四个方向的触发区随分屏缩放，覆盖各自外侧三分之一，中央保留合并操作。
    // 角落同时接近两条边时比较归一化距离，避免宽高比例影响方向判断。
    const distances: [DropPosition, number][] = [
        ['left', (point.x - pane.x) / width],
        ['right', (pane.x + pane.width - point.x) / width],
        ['top', (point.y - pane.y - TAB_BAR_HEIGHT) / contentHeight],
        ['bottom', (pane.y + pane.height - point.y) / contentHeight],
    ];
    distances.sort((a, b) => a[1] - b[1]);
    return distances[0][1] <= 1 / 3 ? distances[0][0] : 'center';
}

// 新分屏必须容纳两个最小终端及一条分隔条；移动和合并不受此限制。
export function canSplit(pane: Rect, position: DropPosition): boolean {
    if (position === 'left' || position === 'right')
        return pane.width >= MIN_PANE_WIDTH * 2 + SPLITTER_SIZE;
    if (position === 'top' || position === 'bottom')
        return pane.height >= MIN_PANE_HEIGHT * 2 + SPLITTER_SIZE;
    return true;
}
