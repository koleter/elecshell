import ast
import contextlib
import errno
import io
from pathlib import Path
import socket
import socketserver
import sys
import unittest
from unittest.mock import Mock


SOURCE_PATH = Path(__file__).resolve().parents[1] / 'server/filetransfer/py_server_transfer.py'


def load_server_namespace(template_name):
    # Read embedded scripts without importing the application's dependencies.
    module = ast.parse(SOURCE_PATH.read_text(encoding='utf-8'))
    assignment = next(
        node for node in module.body
        if isinstance(node, ast.Assign)
        and any(isinstance(target, ast.Name) and target.id == template_name
                for target in node.targets))
    script = ast.literal_eval(assignment.value).format(token='test-token', port=0)[3:-3]
    namespace = dict(errno=errno, socket=socket, sys=sys,
                     ThreadingMixIn=socketserver.ThreadingMixIn,
                     TCPServer=socketserver.TCPServer)
    if template_name == 'python2_start_server_str':
        # These definitions use syntax and APIs shared by Python 2 and 3.
        # Keep the Python 2 print statements out of the Python 3 test runtime.
        helper = script[script.index('def is_client_disconnect('):
                        script.index('def list_directory_contents(')]
        server = script[script.index('class ThreadedHTTPServer('):
                        script.index('# 创建一个简单的 HTTP 服务器')]
        exec(helper + server, namespace)
    else:
        exec(script[:script.index('httpd = ThreadedHTTPServer(')], namespace)
    return namespace


class RemoteHTTPServerErrorTests(unittest.TestCase):
    def dispatch_error(self, namespace, error, stage):
        class Handler:
            def __init__(self, request, client_address, server):
                try:
                    if stage == 'handle':
                        raise error
                finally:
                    if stage == 'finish':
                        raise error

        server = namespace['ThreadedHTTPServer'].__new__(namespace['ThreadedHTTPServer'])
        server.RequestHandlerClass = Handler
        server.shutdown_request = Mock()
        request = object()
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            server.process_request_thread(request, ('127.0.0.1', 12345))
        server.shutdown_request.assert_called_once_with(request)
        return stdout.getvalue() + stderr.getvalue()

    def test_disconnects_are_silent_in_request_and_cleanup(self):
        for template in ('python2_start_server_str', 'python3_start_server_str'):
            namespace = load_server_namespace(template)
            for stage in ('handle', 'finish'):
                for code in (errno.EPIPE, errno.ECONNRESET, errno.ECONNABORTED):
                    with self.subTest(template=template, stage=stage, errno=code):
                        output = self.dispatch_error(namespace, socket.error(code, 'disconnected'), stage)
                        self.assertEqual(output, '')

    def test_other_errors_keep_their_traceback(self):
        for template in ('python2_start_server_str', 'python3_start_server_str'):
            namespace = load_server_namespace(template)
            for stage in ('handle', 'finish'):
                for error in (ValueError('unexpected failure'),
                              socket.error(errno.EACCES, 'permission denied')):
                    with self.subTest(template=template, stage=stage, error=error):
                        output = self.dispatch_error(namespace, error, stage)
                        self.assertIn('Traceback', output)
                        self.assertIn(str(error), output)

    def test_unauthenticated_disconnected_request_is_silent(self):
        namespace = load_server_namespace('python3_start_server_str')

        class DisconnectedSocket:
            def makefile(self, *args):
                return io.BytesIO(b'GET / HTTP/1.0\r\n\r\n')

            def sendall(self, data):
                raise socket.error(errno.EPIPE, 'Broken pipe')

            def shutdown(self, how):
                pass

            def close(self):
                pass

        server = namespace['ThreadedHTTPServer'].__new__(namespace['ThreadedHTTPServer'])
        server.RequestHandlerClass = namespace['MyHTTPRequestHandler']
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            server.process_request_thread(DisconnectedSocket(), ('127.0.0.1', 12345))
        self.assertEqual(stdout.getvalue() + stderr.getvalue(), '')


if __name__ == '__main__':
    unittest.main()
