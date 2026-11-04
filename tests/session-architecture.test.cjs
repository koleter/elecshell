const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const esbuild = require('esbuild');

// 固定模块依赖方向，防止业务服务重新耦合页面和 React 组件。
test('feature modules never import pages and services never import UI modules', () => {
    const featureRoot = path.resolve(__dirname, '../src/features');
    const pagesRoot = path.resolve(__dirname, '../src/pages');
    const violations = [];
    function inspect(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                inspect(file);
                continue;
            }
            if (!/\.tsx?$/.test(file)) continue;
            const ast = ts.createSourceFile(
                file,
                fs.readFileSync(file, 'utf8'),
                ts.ScriptTarget.Latest,
                true,
            );
            for (const statement of ast.statements) {
                if (
                    !ts.isImportDeclaration(statement) ||
                    !ts.isStringLiteral(statement.moduleSpecifier)
                )
                    continue;
                const specifier = statement.moduleSpecifier.text;
                const target = specifier.startsWith('.')
                    ? path.resolve(path.dirname(file), specifier)
                    : specifier;
                if (specifier.startsWith('@/pages/') || target.startsWith(pagesRoot + path.sep))
                    violations.push(`${file}: ${specifier}`);
                if (
                    file.includes(path.sep + 'services' + path.sep) &&
                    !statement.importClause?.isTypeOnly &&
                    (/^(react|antd|@ant-design|@ant-design-icons)(\/|$)/.test(specifier) ||
                        specifier.includes('/components/'))
                )
                    violations.push(`${file}: ${specifier}`);
            }
        }
    }
    inspect(featureRoot);
    assert.deepEqual(violations, []);
});

// 服务测试不加载 React 或页面，只替换传输边界，独立验证连接的所有权和资源释放。
test('session architecture: isolated stores and connection services', async (t) => {
    const previousWebSocket = global.WebSocket;
    const previousFixture = global.__sessionArchitecture;
    const sockets = [];
    const backendCalls = [];
    const hostCalls = [];
    const stops = [];
    const fixture = {
        getUrl: async () => 'http://127.0.0.1/',
        request: async (uri, options) => {
            const body = JSON.parse(options.body);
            backendCalls.push({ uri, body });
            return {
                id: body.id || 'script-created',
                filePath: body.filePath,
                sessionConfId: body.sessionConfId,
                sessionName: body.sessionName,
            };
        },
        desktop: {
            appendFile: (...args) => hostCalls.push(['log', ...args]),
            openDetached: async (...args) => hostCalls.push(['detach', ...args]),
        },
    };
    global.__sessionArchitecture = fixture;
    class Socket {
        static OPEN = 1;
        readyState = 0;
        sent = [];
        constructor(url) {
            this.url = url;
            sockets.push(this);
        }
        send(value) {
            this.sent.push(JSON.parse(value));
        }
        open() {
            this.readyState = 1;
            this.onopen?.({});
        }
        receive(value) {
            this.onmessage?.({ data: JSON.stringify(value) });
        }
        close() {
            this.readyState = 3;
            this.onclose?.({});
        }
    }
    global.WebSocket = Socket;
    try {
        const bundle = await esbuild.build({
            stdin: {
                contents: `export {connectSession} from './src/features/sessions/services/sessionConnection';
                export {sessionService} from './src/features/sessions/services/sessionService';
                export {sessionRegistry} from './src/features/sessions/model/sessionRegistry';
                export {createTransferStore} from './src/features/transfers/model/transferStore';
                export {dragDownloadPayload} from './src/features/transfers/services/transferService';
                export {configurationIndex} from './src/features/catalog/services/catalogService';
                export {settingsService} from './src/features/settings/services/settingsService';
                export {scriptService} from './src/features/scripts/services/scriptService';`,
                resolveDir: path.resolve(__dirname, '..'),
            },
            bundle: true,
            platform: 'node',
            format: 'cjs',
            write: false,
            metafile: true,
            logLevel: 'silent',
            plugins: [
                {
                    name: 'transport-boundaries',
                    setup(build) {
                        build.onResolve(
                            { filter: /platform\/(backend|electronBridge)$/ },
                            (args) => ({
                                path: args.path.endsWith('backend') ? 'backend' : 'desktop',
                                namespace: 'mock',
                            }),
                        );
                        build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
                            contents:
                                args.path === 'backend'
                                    ? 'export const getBackendUrl=()=>global.__sessionArchitecture.getUrl();export const backendRequest=(...args)=>global.__sessionArchitecture.request(...args);'
                                    : 'export const desktop=global.__sessionArchitecture.desktop;',
                        }));
                    },
                },
            ],
        });
        assert.ok(
            !Object.keys(bundle.metafile.inputs).some((file) =>
                /node_modules\/(react|antd)|\/components\//.test(file),
            ),
        );
        const loaded = new Module(__filename, module);
        loaded._compile(bundle.outputFiles[0].text, __filename);
        const {
            connectSession,
            sessionService,
            sessionRegistry,
            createTransferStore,
            configurationIndex,
            dragDownloadPayload,
        } = loaded.exports;
        const flush = () => new Promise((resolve) => setImmediate(resolve));
        function terminal() {
            const data = new Set(),
                resize = new Set();
            return {
                data,
                resize,
                writes: [],
                write(value, processed, show = true) {
                    this.writes.push({ value, show });
                    processed?.(value);
                },
                onData(listener) {
                    data.add(listener);
                    return { dispose: () => data.delete(listener) };
                },
                onResize(listener) {
                    resize.add(listener);
                    return { dispose: () => resize.delete(listener) };
                },
            };
        }
        function options(id, extra = {}) {
            const session = {
                key: id,
                label: id,
                isConnected: true,
                sessionConfId: id,
                sessionConfPath: `/configs/${id}`,
            };
            const state = { sessions: [session], activeKey: id };
            const commands = {
                setSessions(update) {
                    state.sessions = typeof update === 'function' ? update(state.sessions) : update;
                },
                activateSession(key) {
                    state.activeKey = key;
                },
            };
            return {
                getSession: () => session,
                terminal: terminal(),
                commands,
                state,
                transfers: createTransferStore(),
                prompt() {},
                notify() {},
                onOpen() {},
                serialize: () => 'terminal snapshot',
                ...extra,
            };
        }
        async function start(settings) {
            const stop = connectSession(settings);
            stops.push(stop);
            await flush();
            return sockets[sockets.length - 1];
        }
        async function scenario(name, callback) {
            await t.test(name, async () => {
                try {
                    await callback();
                } finally {
                    stops.splice(0).forEach((stop) => stop());
                }
                assert.deepEqual(sessionRegistry.debugSnapshot(), {});
            });
        }

        await scenario('transfer updates notify only the matching session and data channel', () => {
            const store = createTransferStore();
            const calls = [];
            const offFiles = store.subscribe('A', 'files', () => calls.push('files-A'));
            store.subscribe('A', 'progress', () => calls.push('progress-A'));
            store.subscribe('B', 'progress', () => calls.push('progress-B'));
            store.setFiles('A', [{ key: 'log', title: 'log' }]);
            store.updateProgress('A', { id: 'upload', filePath: '/log', percent: 10 });
            const previous = store.getProgress('A');
            store.updateProgress('A', { id: 'upload', filePath: '/log', percent: 75 });
            assert.deepEqual(calls, ['files-A', 'progress-A', 'progress-A']);
            assert.equal(previous[0].percent, 10);
            assert.equal(store.getProgress('A')[0].percent, 75);
            offFiles();
            store.remove('A');
            assert.deepEqual(store.getFiles('A'), []);
            assert.deepEqual(store.getProgress('A'), []);
            assert.equal(calls[calls.length - 1], 'progress-A');
        });
        await scenario(
            'drag download preserves encoded file names and the backend files parameter',
            () => {
                const payload = dragDownloadPayload('http://127.0.0.1:8888/', {
                    sessionId: 'A',
                    directory: '/tmp/中文 空格',
                    files: ['a:b.log'],
                    singleFile: true,
                });
                assert.ok(payload.startsWith('application/octet-stream:a_b.log:'));
                const url = new URL(payload.slice(payload.indexOf('http:')));
                assert.equal(url.pathname, '/dragdownload');
                assert.equal(url.searchParams.get('remoteDir'), '/tmp/中文 空格');
                assert.deepEqual(JSON.parse(url.searchParams.get('files')), ['a:b.log']);
                const archive = dragDownloadPayload('http://127.0.0.1/', {
                    sessionId: 'A',
                    directory: '/',
                    files: ['a', 'b'],
                    singleFile: false,
                });
                assert.ok(archive.startsWith('application/octet-stream:elecshell_2_files.tar.gz:'));
            },
        );
        await scenario('closing during backend discovery never creates a socket', async () => {
            let resolve;
            fixture.getUrl = () =>
                new Promise((done) => {
                    resolve = done;
                });
            const before = sockets.length;
            const stop = connectSession(options('pending'));
            stop();
            resolve('http://127.0.0.1/');
            await flush();
            assert.equal(sockets.length, before);
            fixture.getUrl = async () => 'http://127.0.0.1/';
        });
        await scenario(
            'an old connection cannot remove a replacement with the same session ID',
            async () => {
                const settings = options('replacement');
                const first = await start(settings);
                const oldStop = stops[stops.length - 1];
                const second = await start(options('replacement', { commands: settings.commands }));
                first.open();
                second.open();
                first.close();
                oldStop();
                assert.equal(settings.state.sessions[0].isConnected, true);
                assert.equal(sessionRegistry.get('replacement').debug.sock, second);
                assert.equal(sessionRegistry.get('replacement').status, 'connected');
            },
        );
        await scenario(
            'callbacks belong to their socket and closing disposes terminal subscriptions',
            async () => {
                const a = options('callbacks-A'),
                    b = options('callbacks-B');
                const socketA = await start(a),
                    socketB = await start(b);
                socketA.open();
                socketB.open();
                const results = [];
                const runtime = sessionRegistry.get('callbacks-A');
                runtime.requestOutput('pwd', (value) => results.push(value));
                const requestId = socketA.sent[socketA.sent.length - 1].requestId;
                socketB.receive({
                    type: 'response',
                    requestId,
                    val: Buffer.from('wrong socket').toString('base64'),
                });
                assert.deepEqual(results, []);
                socketA.receive({
                    type: 'response',
                    requestId,
                    val: Buffer.from('correct socket').toString('base64'),
                });
                assert.deepEqual(results, ['correct socket']);
                runtime.requestOutput('later', (value) => results.push(value));
                runtime.close();
                assert.equal(a.terminal.data.size, 0);
                assert.equal(a.terminal.resize.size, 0);
                assert.equal(socketA.onmessage, null);
                assert.deepEqual(results, ['correct socket']);
            },
        );
        await scenario(
            'remote close marks only its session disconnected and releases its runtime',
            async () => {
                const settings = options('remote-close');
                const socket = await start(settings);
                socket.open();
                socket.close();
                assert.equal(settings.state.sessions[0].isConnected, false);
                assert.equal(sessionRegistry.get('remote-close'), undefined);
                assert.equal(settings.terminal.data.size, 0);
                assert.ok(settings.terminal.writes[0].value.includes('closed'));
            },
        );
        await scenario(
            'script readiness supports completion, cancellation and timeout',
            async () => {
                const socket = await start(options('ready'));
                const ready = sessionRegistry.waitUntilReady(['ready']);
                socket.open();
                assert.equal(await ready, true);
                const controller = new AbortController();
                const cancelled = sessionRegistry.waitUntilReady(['never'], controller.signal);
                controller.abort();
                assert.equal(await cancelled, false);
                assert.equal(await sessionRegistry.waitUntilReady(['never'], undefined, 5), false);
            },
        );
        await scenario(
            'batch script creation keeps valid configurations and reports invalid entries',
            async () => {
                configurationIndex.replace({ valid: '/configs/valid' });
                const settings = options('script-owner');
                const notices = [];
                const before = backendCalls.length;
                const responses = await sessionService.openFromScript(
                    ['missing', { conf_id: 'valid', session_name: 'Named' }],
                    settings.commands,
                    'gbk',
                    (notice) => notices.push(notice),
                );
                assert.equal(backendCalls.length, before + 1);
                assert.equal(notices[0].content, 'invalid sessionConfId: missing');
                assert.equal(responses.length, 1);
                assert.equal(settings.state.sessions[1].label, 'Named');
                assert.equal(settings.state.sessions[1].encoding, 'gbk');
            },
        );
        await scenario(
            'log and detached-window effects cross the desktop boundary with the original snapshot',
            async () => {
                const settings = options('detach');
                settings.getSession().logPath = '/terminal.log';
                const socket = await start(settings);
                socket.open();
                socket.receive({
                    type: 'data',
                    val: Buffer.from('logged output').toString('base64'),
                });
                assert.deepEqual(hostCalls[hostCalls.length - 1], [
                    'log',
                    '/terminal.log',
                    'logged output',
                ]);
                await sessionService.detach(settings.getSession(), settings.commands);
                assert.ok(socket.sent.some((message) => message.type === 'detach'));
                assert.equal(socket.readyState, 3);
                assert.deepEqual(settings.state.sessions, []);
                assert.equal(hostCalls[hostCalls.length - 1][2], 'terminal snapshot');
            },
        );
    } finally {
        stops.splice(0).forEach((stop) => stop());
        global.WebSocket = previousWebSocket;
        if (previousFixture === undefined) delete global.__sessionArchitecture;
        else global.__sessionArchitecture = previousFixture;
    }
});
