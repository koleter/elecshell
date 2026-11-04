const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// 直接加载纯布局模型，不启动 Umi、Electron 或 SSH，便于快速验证状态变换。
const filename = path.resolve(__dirname, '../src/features/workspace/model/layout.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
});
const loaded = new Module(filename, module);
loaded._compile(compiled.outputText, filename);
const {
    createWorkspace, workspaceReducer: reduce, getGroups, getFocusedSession,
    measureLayout, minimumSize, constrainRatio, dropPosition, canSplit, splitDestination,
} = loaded.exports;

const session = (key, extra = {}) => ({key, label: key, isConnected: true, sessionConfPath: `/configs/${key}`, ...extra});
const make = (...keys) => createWorkspace(keys.map(key => session(key)));
const groupFor = (state, key) => getGroups(state.root).find(group => group.tabs.includes(key));
const move = (state, key, targetKey, position, index) => reduce(state, {type: 'move', sessionId: key, groupId: groupFor(state, targetKey).id, position, index});

function invariant(state) {
    // 任意操作后，每个会话恰好归属一个组，活动标签和焦点均指向有效节点。
    const groups = getGroups(state.root);
    const tabs = groups.flatMap(group => group.tabs);
    assert.deepEqual([...tabs].sort(), state.sessions.map(item => item.key).sort());
    assert.equal(new Set(tabs).size, tabs.length);
    assert.equal(new Set(groups.map(group => group.id)).size, groups.length);
    for (const group of groups) assert.ok(group.tabs.length ? group.tabs.includes(group.activeTabId) : group.activeTabId === null);
    assert.ok(groups.some(group => group.id === state.focusedGroupId));
    if (state.maximizedGroupId) assert.ok(groups.some(group => group.id === state.maximizedGroupId));
}

for (const [position, axis, before] of [['left', 'x', true], ['right', 'x', false], ['top', 'y', true], ['bottom', 'y', false]]) {
    test(`split ${position} preserves session identities and creates two tab groups`, () => {
        const original = make('A', 'B', 'C');
        const next = move(original, 'B', 'A', position);
        assert.equal(next.root.type, 'split');
        assert.equal(next.root.axis, axis);
        assert.equal(next.root.ratio, 0.5);
        assert.deepEqual(getGroups(next.root.children[before ? 0 : 1])[0].tabs, ['B']);
        assert.deepEqual(groupFor(next, 'A').tabs, ['A', 'C']);
        assert.equal(getFocusedSession(next), 'B');
        assert.strictEqual(next.sessions, original.sessions);
        next.sessions.forEach((item, index) => assert.strictEqual(item, original.sessions[index]));
        invariant(next);
    });
}

test('nested splits support more than a fixed four or nine pane limit', () => {
    let state = make(...Array.from({length: 32}, (_, i) => String(i)));
    for (let i = 1; i < 32; i++) state = move(state, String(i), '0', i % 2 ? 'right' : 'bottom');
    assert.equal(getGroups(state.root).length, 32);
    invariant(state);
    const layout = measureLayout(state.root, {x: 0, y: 0, ...minimumSize(state.root)});
    assert.equal(layout.panes.length, 32);
    assert.equal(layout.splitters.length, 31);
});

test('tab strip insertion uses the insertion boundary in both directions', () => {
    let state = make('A', 'B', 'C', 'D');
    state = move(state, 'A', 'D', 'tabs', 4);
    assert.deepEqual(getGroups(state.root)[0].tabs, ['B', 'C', 'D', 'A']);
    state = move(state, 'A', 'B', 'tabs', 0);
    assert.deepEqual(getGroups(state.root)[0].tabs, ['A', 'B', 'C', 'D']);
    state = move(state, 'B', 'C', 'tabs', 2);
    assert.deepEqual(getGroups(state.root)[0].tabs, ['A', 'B', 'C', 'D']);
    invariant(state);
});

test('merging the final source tab collapses its ancestors without closing any session', () => {
    let state = move(make('A', 'B', 'C'), 'B', 'A', 'right');
    state = move(state, 'C', 'B', 'bottom');
    const sessions = state.sessions;
    state = move(state, 'C', 'B', 'center');
    assert.equal(getGroups(state.root).length, 2);
    assert.deepEqual(groupFor(state, 'B').tabs, ['B', 'C']);
    state = move(state, 'A', 'B', 'tabs', 1);
    assert.equal(state.root.type, 'group');
    assert.deepEqual(state.root.tabs, ['B', 'A', 'C']);
    assert.strictEqual(state.sessions, sessions);
    invariant(state);
});

test('splitting a pane containing only the dragged tab does not create an empty sibling', () => {
    const state = make('A');
    assert.strictEqual(move(state, 'A', 'A', 'right'), state);
});

test('closing a tab selects its local neighbor and closing the final pane resets to an empty group', () => {
    let state = move(make('A', 'B', 'C'), 'B', 'A', 'right');
    state = reduce(state, {type: 'activate', sessionId: 'C'});
    state = reduce(state, {type: 'sessions', update: items => items.filter(item => item.key !== 'C')});
    assert.equal(getFocusedSession(state), 'A');
    state = reduce(state, {type: 'sessions', update: items => items.filter(item => item.key !== 'A')});
    assert.equal(getFocusedSession(state), 'B');
    assert.equal(state.root.type, 'group');
    state = reduce(state, {type: 'sessions', update: []});
    assert.equal(getGroups(state.root).length, 1);
    assert.equal(getFocusedSession(state), '');
    invariant(state);
});

test('maximizing and switching focus preserves other pane selections and the underlying tree', () => {
    let state = move(make('A', 'B'), 'B', 'A', 'right');
    const root = state.root;
    const a = groupFor(state, 'A').id;
    state = reduce(state, {type: 'maximize', groupId: a});
    assert.strictEqual(state.root, root);
    assert.equal(measureLayout(state.root, {x: 0, y: 0, width: 1000, height: 700}, state.maximizedGroupId).panes.length, 1);
    state = reduce(state, {type: 'focus', groupId: groupFor(state, 'B').id});
    assert.equal(state.maximizedGroupId, groupFor(state, 'B').id);
    assert.equal(getFocusedSession(state), 'B');
    state = reduce(state, {type: 'maximize', groupId: state.focusedGroupId});
    assert.equal(state.maximizedGroupId, null);
    invariant(state);
});

test('new sessions from the sidebar or scripts join the focused group', () => {
    let state = move(make('A', 'B'), 'B', 'A', 'right');
    state = reduce(state, {type: 'sessions', update: items => [...items, session('script'), session('script-2')]});
    assert.deepEqual(groupFor(state, 'B').tabs, ['B', 'script', 'script-2']);
    assert.equal(getFocusedSession(state), 'B');
    state = reduce(state, {type: 'activate', sessionId: 'script'});
    assert.equal(getFocusedSession(state), 'script');
    invariant(state);
});

test('the first sessions created in an empty window share one full-width pane', () => {
    let state = createWorkspace();
    assert.equal(state.root.type, 'group');
    state = reduce(state, {type: 'sessions', update: [session('new-B', {sessionConfPath: '/configs/B'})]});
    assert.equal(state.root.type, 'group');
    assert.deepEqual(state.root.tabs, ['new-B']);
    state = reduce(state, {type: 'sessions', update: items => [...items, session('new-A', {sessionConfPath: '/configs/A'})]});
    assert.deepEqual(state.root.tabs, ['new-B', 'new-A']);
    assert.equal(measureLayout(state.root, {x: 0, y: 0, width: 1200, height: 800}).panes[0].width, 1200);
    invariant(state);
});

test('closing all sessions clears nested splits and maximization before the next connection', () => {
    let state = move(make('A', 'B', 'C'), 'B', 'A', 'right');
    state = move(state, 'C', 'B', 'bottom');
    state = reduce(state, {type: 'maximize', groupId: groupFor(state, 'C').id});
    state = reduce(state, {type: 'sessions', update: []});
    assert.equal(state.root.type, 'group');
    assert.equal(state.focusedGroupId, state.root.id);
    assert.equal(state.maximizedGroupId, null);
    state = reduce(state, {type: 'sessions', update: [session('next')]});
    assert.deepEqual(state.root.tabs, ['next']);
    assert.equal(measureLayout(state.root, {x: 0, y: 0, width: 1200, height: 800}).panes[0].width, 1200);
    invariant(state);
});

test('each new workspace starts in one pane independently of a previously split workspace', () => {
    const previous = move(make('A', 'B'), 'B', 'A', 'bottom');
    const next = createWorkspace(previous.sessions);
    assert.equal(next.root.type, 'group');
    assert.deepEqual(next.root.tabs, ['A', 'B']);
    assert.equal(next.focusedGroupId, next.root.id);
    assert.equal(next.maximizedGroupId, null);
    assert.equal(getGroups(previous.root).length, 2);
    assert.strictEqual(next.sessions, previous.sessions);
    invariant(previous);
    invariant(next);
});

test('recursive minimum sizes constrain resize handles and remain finite in a smaller window', () => {
    let state = move(make('A', 'B', 'C'), 'B', 'A', 'right');
    state = move(state, 'C', 'B', 'bottom');
    assert.deepEqual(minimumSize(state.root), {width: 485, height: 285});
    assert.equal(constrainRatio(state.root, {x: 0, y: 0, width: 1005, height: 600}, 0), 0.24);
    for (const bounds of [{width: 800, height: 600}, {width: 200, height: 100}]) {
        const layout = measureLayout(state.root, {x: 0, y: 0, ...bounds});
        layout.panes.forEach(pane => {
            assert.ok(Number.isFinite(pane.width) && pane.width >= 0);
            assert.ok(Number.isFinite(pane.height) && pane.height >= 0);
        });
    }
});

test('drop regions distinguish the tab strip, four edges and center; minimum dimensions govern splitting', () => {
    const pane = {x: 100, y: 100, width: 600, height: 500};
    for (const [x, y, expected] of [[400, 110, 'tabs'], [105, 350, 'left'], [695, 350, 'right'], [400, 145, 'top'], [400, 595, 'bottom'], [400, 350, 'center']]) {
        assert.equal(dropPosition({x, y}, pane), expected);
    }
    assert.equal(canSplit({...pane, width: 484}, 'left'), false);
    assert.equal(canSplit({...pane, width: 485}, 'right'), true);
    assert.equal(canSplit({...pane, height: 284}, 'bottom'), false);
    assert.equal(canSplit({...pane, height: 285}, 'top'), true);
});

test('split previews activate inside the outer thirds at every pane size, including nested panes', () => {
    // 同时覆盖大窗口、高窗口和带坐标偏移的小分屏，防止退回固定像素的窄触发区。
    for (const pane of [
        {x: 100, y: 60, width: 2400, height: 1440},
        {x: 180, y: 110, width: 1000, height: 1200},
        {x: 700, y: 400, width: 500, height: 300},
    ]) {
        const at = (x, y) => ({x: pane.x + pane.width * x, y: pane.y + 40 + (pane.height - 40) * y});
        for (const [x, y, expected] of [
            [0.25, 0.5, 'left'], [0.75, 0.5, 'right'],
            [0.5, 0.25, 'top'], [0.5, 0.75, 'bottom'],
            [0.32, 0.5, 'left'], [0.68, 0.5, 'right'],
            [0.5, 0.32, 'top'], [0.5, 0.68, 'bottom'],
            [0.34, 0.5, 'center'], [0.66, 0.5, 'center'],
            [0.5, 0.34, 'center'], [0.5, 0.66, 'center'],
            [0.5, 0.5, 'center'],
            [0.1, 0.2, 'left'], [0.2, 0.1, 'top'],
            [0.9, 0.8, 'right'], [0.8, 0.9, 'bottom'],
        ]) {
            assert.equal(dropPosition(at(x, y), pane), expected, `${pane.width}x${pane.height} at ${x},${y}`);
        }
        assert.equal(dropPosition({x: pane.x + pane.width * 0.75, y: pane.y + 20}, pane), 'tabs');
    }
});

test('mixed moves, splits, closes and additions never lose or duplicate a session', () => {
    let state = make(...Array.from({length: 20}, (_, i) => String(i)));
    // 固定种子使混合操作可重复，出现布局丢失或重复时能稳定复现。
    let seed = 1729;
    const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
    const positions = ['tabs', 'center', 'left', 'right', 'top', 'bottom'];
    for (let iteration = 0; iteration < 1000; iteration++) {
        if (iteration % 17 === 0) state = reduce(state, {type: 'sessions', update: items => [...items, session(`new-${iteration}`)]});
        const source = state.sessions[random(state.sessions.length)].key;
        const destination = state.sessions[random(state.sessions.length)].key;
        state = move(state, source, destination, positions[random(positions.length)], random(10));
        if (iteration % 23 === 0 && state.sessions.length > 1) state = reduce(state, {type: 'sessions', update: items => items.filter(item => item.key !== source)});
        invariant(state);
    }
});


test('split minima use the expanded destination after removing an empty source, not a maximized viewport', () => {
    const state = move(make('A', 'B', 'C'), 'B', 'A', 'right');
    const bounds = {x: 0, y: 0, width: 805, height: 600};
    const target = groupFor(state, 'A');
    const current = measureLayout(state.root, bounds).panes.find(pane => pane.group.id === target.id);
    assert.equal(canSplit(current, 'left'), false);
    const expanded = splitDestination(state, 'B', target.id, bounds);
    assert.equal(expanded.width, 805);
    assert.equal(canSplit(expanded, 'left'), true);
    const actual = splitDestination({...state, maximizedGroupId: target.id}, 'C', target.id, bounds);
    assert.equal(actual.width, current.width);
    assert.equal(canSplit(actual, 'left'), false);
});
