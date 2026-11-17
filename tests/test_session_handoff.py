import ast
import asyncio
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


def load_methods():
    # 直接测试生命周期方法，避免加载 SSH、配置和运行中的 Tornado 服务。
    source = Path(__file__).resolve().parents[1] / 'server/handler/WsockHandler.py'
    tree = ast.parse(source.read_text(encoding='utf-8'))
    handler = next(node for node in tree.body if isinstance(node, ast.ClassDef)
                   and node.name == 'WsockHandler')
    methods = [node for node in handler.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
               and node.name in ('on_message', 'on_close')]
    namespace = dict(json=json, logging=Mock(), clear_worker=Mock())
    exec(compile(ast.Module(body=methods, type_ignores=[]), str(source), 'exec'), namespace)
    return namespace


class SessionHandoffTests(unittest.TestCase):
    def setUp(self):
        self.methods = load_methods()
        self.worker = SimpleNamespace(id='A', fd=7, closed=False, handler=None, close=Mock())
        self.handler = SimpleNamespace(worker_ref=self.worker, detached=False,
                                       close_reason=None, loop=Mock())

    def test_detach_releases_only_its_own_worker_handler(self):
        self.worker.handler = self.handler
        asyncio.run(self.methods['on_message'](self.handler, json.dumps({'type': 'detach'})))
        self.assertTrue(self.handler.detached)
        self.assertIsNone(self.worker.handler)
        self.handler.loop.remove_handler.assert_called_once_with(7)
        self.worker.close.assert_not_called()

    def test_late_detach_cannot_remove_the_destination_handler(self):
        destination = object()
        self.worker.handler = destination
        asyncio.run(self.methods['on_message'](self.handler, json.dumps({'type': 'detach'})))
        self.assertIs(self.worker.handler, destination)
        self.handler.loop.remove_handler.assert_not_called()

    def test_late_close_cannot_disconnect_a_new_owner(self):
        for detached in (True, False):
            with self.subTest(detached=detached):
                self.handler.detached = detached
                destination = object()
                self.worker.handler = destination
                self.methods['on_close'](self.handler)
                self.assertIs(self.worker.handler, destination)
                self.handler.loop.remove_handler.assert_not_called()
                self.methods['clear_worker'].assert_not_called()
                self.worker.close.assert_not_called()

    def test_explicit_close_still_disposes_the_current_worker(self):
        self.worker.handler = self.handler
        self.methods['on_close'](self.handler)
        self.methods['clear_worker'].assert_called_once_with(self.worker)
        self.worker.close.assert_called_once_with(reason=None)


if __name__ == '__main__':
    unittest.main()
