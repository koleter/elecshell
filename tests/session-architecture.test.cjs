const assert = require('node:assert/strict');
const { test } = require('node:test');
const Module = require('node:module');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const esbuild = require('esbuild');

test('terminal decoder keeps packet boundaries and logical streams separate', async (t) => {
    const filename = path.resolve(__dirname, '../src/features/sessions/services/terminalDecoder.ts');
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    const loaded = new Module(filename, module);
    loaded._compile(compiled.outputText, filename);
    const { TerminalDecoder } = loaded.exports;
    const base64 = (bytes) => Buffer.from(bytes).toString('base64');
    const gbk = Uint8Array.from([0xd6, 0xd0, 0xce, 0xc4]); // 中文

    for (const encoding of [undefined, 'utf-8', 'utf8', 'UTF-8']) {
        await t.test(`UTF-8 ${encoding} passes raw bytes to xterm`, () => {
            const decoder = new TerminalDecoder(encoding);
            const bytes = Uint8Array.from(Buffer.from('中文😀𠮷\r\n'));
            for (const show of [true, false]) {
                for (let split = 0; split <= bytes.length; split++) {
                    assert.deepEqual(decoder.decodeData(base64(bytes.subarray(0, split)), show), bytes.subarray(0, split));
                    assert.deepEqual(decoder.decodeData(base64(bytes.subarray(split)), show), bytes.subarray(split));
                }
            }
        });
    }
    await t.test('GBK characters survive every byte boundary', () => {
        for (let split = 0; split <= gbk.length; split++) {
            const decoder = new TerminalDecoder('gbk');
            const first = decoder.decodeData(base64(gbk.subarray(0, split)));
            const second = decoder.decodeData(base64(gbk.subarray(split)));
            assert.equal(first + second, '中文');
        }
        const decoder = new TerminalDecoder('gbk');
        assert.equal(Array.from(gbk, (byte) => decoder.decodeData(base64([byte]))).join(''), '中文');
    });
    await t.test('visible and hidden GBK streams keep their own partial characters', () => {
        const decoder = new TerminalDecoder('gbk');
        assert.equal(decoder.decodeData(base64([0xd6])), '');
        assert.equal(decoder.decodeData(base64([0xce]), false), '');
        assert.equal(decoder.decodeData(base64([0xd0])), '中');
        assert.equal(decoder.decodeData(base64([0xc4]), false), '文');
    });
    await t.test('responses neither consume nor reset terminal stream state', () => {
        const decoder = new TerminalDecoder('gbk');
        assert.equal(decoder.decodeData(base64([0xd6])), '');
        assert.equal(decoder.decodeData(base64([0xce]), false), '');
        assert.equal(decoder.decodeResponse(base64(gbk)), '中文');
        assert.equal(decoder.decodeData(base64([0xd0])), '中');
        assert.equal(decoder.decodeData(base64([0xc4]), false), '文');
    });
    await t.test('independent responses do not join partial characters', () => {
        const decoder = new TerminalDecoder('gbk');
        assert.equal(decoder.decodeResponse(base64([0xd6])), '�');
        assert.equal(decoder.decodeResponse(base64([0xd0])), '�');
        assert.equal(decoder.decodeResponse(base64(gbk)), '中文');
    });
    await t.test('each connection keeps its own decoder state', () => {
        const first = new TerminalDecoder('gbk');
        const second = new TerminalDecoder('gbk');
        assert.equal(first.decodeData(base64([0xd6])), '');
        assert.equal(second.decodeData(base64([0xce, 0xc4])), '文');
        assert.equal(first.decodeData(base64([0xd0])), '中');
    });
    await t.test('UTF-8 responses remain strings', () => {
        assert.equal(new TerminalDecoder('utf-8').decodeResponse(base64(Buffer.from('中文😀𠮷'))), '中文😀𠮷');
    });
    await t.test('legacy decoding preserves ANSI sequences for the terminal parser', () => {
        const decoder = new TerminalDecoder('gbk');
        const bytes = Buffer.concat([Buffer.from('\x1b[31m'), gbk, Buffer.from('\x1b[0m\r\n')]);
        assert.equal(Array.from(bytes, (byte) => decoder.decodeData(base64([byte]))).join(''), '\x1b[31m中文\x1b[0m\r\n');
    });
});

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
            const visibleDecoder = new TextDecoder();
            const hiddenDecoder = new TextDecoder();
            return {
                data,
                resize,
                writes: [],
                write(value, processed, show = true) {
                    this.writes.push({ value, show });
                    const text = typeof value === 'string'
                        ? value
                        : (show ? visibleDecoder : hiddenDecoder).decode(value, { stream: true });
                    processed?.(text);
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
                const oldRuntime = sessionRegistry.get('replacement');
                const second = await start(options('replacement', { commands: settings.commands }));
                first.open();
                second.open();
                await assert.rejects(oldRuntime.requestOutput('pwd'), /has been replaced/);
                assert.deepEqual(first.sent, []);
                first.close();
                oldStop();
                assert.equal(settings.state.sessions[0].isConnected, true);
                assert.equal(sessionRegistry.get('replacement').debug.sock, second);
                assert.equal(sessionRegistry.get('replacement').status, 'connected');
            },
        );
        await scenario(
            'requests belong to their socket and closing rejects pending work and disposes subscriptions',
            async () => {
                const a = options('callbacks-A'),
                    b = options('callbacks-B');
                const socketA = await start(a),
                    socketB = await start(b);
                socketA.open();
                socketB.open();
                const runtime = sessionRegistry.get('callbacks-A');
                let settled = false;
                const result = runtime.requestOutput('pwd');
                void result.then(() => { settled = true; });
                const requestId = socketA.sent[socketA.sent.length - 1].requestId;
                socketB.receive({
                    type: 'response',
                    requestId,
                    val: Buffer.from('wrong socket').toString('base64'),
                });
                await flush();
                assert.equal(settled, false);
                socketA.receive({
                    type: 'response',
                    requestId,
                    val: Buffer.from('correct socket').toString('base64'),
                });
                assert.equal(await result, 'correct socket');
                const pending = ['later', 'another'].map((command) =>
                    assert.rejects(runtime.requestOutput(command), /session is closed/),
                );
                const lateMessage = socketA.onmessage;
                runtime.close();
                await Promise.all(pending);
                lateMessage({ data: JSON.stringify({ type: 'response', requestId, val: '%' }) });
                await assert.rejects(runtime.requestOutput('after close'), /session is closed/);
                assert.equal(a.terminal.data.size, 0);
                assert.equal(a.terminal.resize.size, 0);
                assert.equal(socketA.onmessage, null);
            },
        );
        await scenario('unavailable sockets reject requests without sending them', async () => {
            const socket = await start(options('unavailable'));
            const runtime = sessionRegistry.get('unavailable');
            for (const readyState of [0, 2, 3]) {
                socket.readyState = readyState;
                await assert.rejects(runtime.requestOutput('pwd'), /session is not connected/);
                assert.deepEqual(socket.sent, []);
            }
            socket.open();
            const result = runtime.requestOutput('pwd');
            socket.receive({
                type: 'response',
                requestId: socket.sent[0].requestId,
                val: Buffer.from('/tmp').toString('base64'),
            });
            assert.equal(await result, '/tmp');
        });
        await scenario('send failures reject and discard the unsent request', async () => {
            const socket = await start(options('send-failure'));
            socket.open();
            const runtime = sessionRegistry.get('send-failure');
            const send = socket.send;
            const error = new Error('socket send failed');
            let failedId;
            socket.send = (value) => {
                failedId = JSON.parse(value).requestId;
                throw error;
            };
            await assert.rejects(runtime.requestOutput('pwd'), (reason) => reason === error);
            socket.send = send;
            // 已经失败的请求不再解码迟到响应；非法 base64 也应被直接忽略。
            assert.doesNotThrow(() => socket.receive({ type: 'response', requestId: failedId, val: '%' }));
            const result = runtime.requestOutput('retry');
            socket.receive({
                type: 'response',
                requestId: socket.sent[0].requestId,
                val: Buffer.from('retried').toString('base64'),
            });
            assert.equal(await result, 'retried');
        });
        await scenario('pending requests allow terminal output and responses can arrive out of order', async () => {
            const settings = options('pending-output');
            const socket = await start(settings);
            socket.open();
            const runtime = sessionRegistry.get('pending-output');
            const results = [];
            const first = runtime.requestOutput('first').then((value) => results.push(value));
            const second = runtime.requestOutput('second').then((value) => results.push(value));
            const [firstId, secondId] = socket.sent.map((message) => message.requestId);
            socket.receive({ type: 'data', val: Buffer.from('still displaying\r\n').toString('base64') });
            await flush();
            assert.deepEqual(results, []);
            assert.equal(settings.terminal.writes.length, 1);
            socket.receive({ type: 'response', requestId: secondId, val: Buffer.from('second result').toString('base64') });
            await second;
            assert.deepEqual(results, ['second result']);
            assert.doesNotThrow(() => socket.receive({ type: 'response', requestId: secondId, val: '%' }));
            socket.receive({ type: 'response', requestId: firstId, val: Buffer.from('first result').toString('base64') });
            await first;
            assert.deepEqual(results, ['second result', 'first result']);
        });
        await scenario('a malformed response rejects only its matching request', async () => {
            const socket = await start(options('bad-response'));
            socket.open();
            const runtime = sessionRegistry.get('bad-response');
            const rejected = assert.rejects(runtime.requestOutput('bad'));
            const good = runtime.requestOutput('good');
            const [badId, goodId] = socket.sent.map((message) => message.requestId);
            assert.doesNotThrow(() => socket.receive({ type: 'response', requestId: badId, val: '%' }));
            await rejected;
            assert.doesNotThrow(() => socket.receive({ type: 'response', requestId: badId, val: '%' }));
            socket.receive({ type: 'response', requestId: goodId, val: Buffer.from('ok').toString('base64') });
            assert.equal(await good, 'ok');
        });
        await scenario('UTF-8 data reaches the terminal as bytes and callbacks remain strings', async () => {
            const settings = options('utf8-data');
            settings.getSession().logPath = '/utf8.log';
            const socket = await start(settings);
            socket.open();
            const bytes = Buffer.from('中文😀\r\n');
            const before = hostCalls.length;
            socket.receive({ type: 'data', val: bytes.subarray(0, 2).toString('base64') });
            socket.receive({
                type: 'data',
                val: bytes.subarray(2).toString('base64'),
                requestId: 'utf8-data-result',
            });
            assert.deepEqual(settings.terminal.writes.map((write) => write.value), [
                Uint8Array.from(bytes.subarray(0, 2)),
                Uint8Array.from(bytes.subarray(2)),
            ]);
            assert.equal(hostCalls.slice(before).map((call) => call[2]).join(''), '中文😀\r\n');
            assert.equal(socket.sent.find((message) => message.requestId === 'utf8-data-result').args, '中文😀\r\n');
        });
        await scenario('GBK visible, hidden and response messages keep separate decoder state', async () => {
            const settings = options('gbk-data');
            settings.getSession().encoding = 'gbk';
            const socket = await start(settings);
            socket.open();
            const receive = (bytes, showOnTerm) => socket.receive({
                type: 'data', val: Buffer.from(bytes).toString('base64'), showOnTerm,
            });
            receive([0xd6], true);
            receive([0xce], false);
            const result = sessionRegistry.get('gbk-data').requestOutput('pwd');
            const requestId = socket.sent[socket.sent.length - 1].requestId;
            socket.receive({ type: 'response', requestId, val: Buffer.from([0xd6, 0xd0, 0xce, 0xc4]).toString('base64') });
            receive([0xd0, 13, 10], true);
            receive([0xc4, 13, 10], false);
            assert.equal(await result, '中文');
            assert.deepEqual(settings.terminal.writes, [
                { value: '', show: true },
                { value: '', show: false },
                { value: '中\r\n', show: true },
                { value: '文\r\n', show: false },
            ]);
        });
        await scenario(
            'remote close marks only its session disconnected and releases its runtime',
            async () => {
                const settings = options('remote-close');
                const socket = await start(settings);
                socket.open();
                const rejected = assert.rejects(
                    sessionService.readWorkingDirectory('remote-close'),
                    /session is closed/,
                );
                socket.close();
                await rejected;
                assert.equal(settings.state.sessions[0].isConnected, false);
                assert.equal(sessionRegistry.get('remote-close'), undefined);
                assert.equal(settings.terminal.data.size, 0);
                assert.ok(settings.terminal.writes[0].value.includes('closed'));
            },
        );
        await scenario('working directory requests propagate connection errors and parse successful output', async () => {
            await assert.rejects(sessionService.readWorkingDirectory('missing'), /session is closed/);
            const settings = options('working-directory');
            const socket = await start(settings);
            await assert.rejects(sessionService.readWorkingDirectory('working-directory'), /session is not connected/);
            socket.open();
            const result = sessionService.readWorkingDirectory('working-directory');
            assert.equal(socket.sent[0].data, 'pwd');
            socket.receive({
                type: 'response',
                requestId: socket.sent[0].requestId,
                val: Buffer.from('pwd\r\n/tmp/中文\r\n$ ').toString('base64'),
            });
            assert.equal(await result, '/tmp/中文');
            assert.equal(settings.terminal.writes[0].show, false);
        });
        await scenario('script sendRecv retains its callback protocol and handles request failures', async () => {
            const notices = [];
            const socket = await start(options('script-output', { notify: (notice) => notices.push(notice) }));
            socket.open();
            const invoke = (requestId) => socket.receive({
                type: 'execSessionMethod', method: 'sendRecv', args: 'pwd', requestId,
            });
            invoke('script-success');
            const requestId = socket.sent[0].requestId;
            socket.receive({ type: 'response', requestId, val: Buffer.from('script output').toString('base64') });
            await flush();
            assert.deepEqual(socket.sent[1], {
                type: 'callback', requestId: 'script-success', args: 'script output',
            });
            socket.receive({ type: 'response', requestId, val: '%' });
            await flush();
            assert.equal(socket.sent.length, 2);

            const send = socket.send;
            socket.send = function (value) {
                if (JSON.parse(value).type === 'sendRecv') throw new Error('script send failed');
                send.call(this, value);
            };
            invoke('script-failure');
            await flush();
            assert.deepEqual(socket.sent[2], { type: 'del_callback_map', requestId: 'script-failure' });
            assert.deepEqual(notices, [{ status: 'error', content: 'Error: script send failed' }]);

            socket.send = () => { throw new Error('all sends failed'); };
            invoke('script-cleanup-failure');
            await flush();
            assert.equal(notices[1].content, 'Error: all sends failed');
            socket.send = send;
            invoke('script-closed');
            socket.close();
            await flush();
            assert.equal(notices.length, 2);
            assert.equal(socket.sent.filter((message) => message.type === 'callback').length, 1);
        });
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
