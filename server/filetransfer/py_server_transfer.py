import asyncio
import logging
import os
import re
import uuid

import requests
from filetransfer.base_transfer import BaseTransfer
from util.error import b_is_error
from util.local_server import start_local_server
from utils import gen_id
from urllib.parse import quote

port_pattern = re.compile(b'Port (\\d+) is unavailable')
py_version_pattern = re.compile(b'Python (\\d)\\.')
host_pattern = re.compile(br'((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)')

python2_start_server_str = '''"""
# -*- coding: utf-8 -*-
from SocketServer import ThreadingMixIn, TCPServer
import SimpleHTTPServer
import os
import urlparse
import json
import urllib

def list_directory_contents(path):
    def _list_contents(path, indent=0):
        entries = []
        try:
            for entry in os.listdir(path):
                entry_path = os.path.join(path, entry)
                if os.path.isdir(entry_path):
                    entries.append(('D', entry, _list_contents(entry_path, indent + 1)))
                else:
                    entries.append(('F', entry))
        except OSError as e:
            pass
        return entries

    return _list_contents(path)


class MyHTTPRequestHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):

    def log_message(self, format, *args):
        # 不执行任何操作，从而禁用日志
        pass

    def send_error_response(self, code, message=None):
        if message:
            self.send_response(code)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(message.encode('utf-8'))
        else:
            self.send_error(code)

    def do_GET(self):
        # 获取请求的路径
        raw_path = self.path
        path = urllib.unquote(raw_path)

        # 分离路径和查询字符串
        query_start = path.find('?')
        if query_start != -1:
            query_string = path[query_start + 1:]
            file_path = path[:query_start]
        else:
            self.send_error(404)
            return

        # 解析查询字符串
        query_params = dict()
        for param in query_string.split('&'):
            key_value = param.split('=')
            if len(key_value) == 2:
                key, value = key_value
                query_params[key] = value

        if query_params.get('token') != '{token}':
            self.send_error(404)
            return

        type = query_params.get('type')
        if type == 'getFileSize':
            try:
                self.send_response(200)
                self.send_header('Content-type', 'text/plain')
                self.end_headers()
                if not os.path.exists(file_path):
                    file_size = 0
                else:
                    file_size = os.path.getsize(file_path)
                self.wfile.write(str(file_size))
            except Exception:
                self.send_response(500)
                self.wfile.write('0')
        else:
            # 检查路径是否指向一个有效的文件
            if os.path.isfile(file_path):
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()

                try:
                    # 打开文件并读取内容
                    with open(file_path, 'rb') as file:
                        self.wfile.write(file.read())
                except IOError as e:
                    self.send_error(500, 'Internal Server Error')
                    print 'Error opening file:', e
            elif os.path.isdir(file_path):
                if os.path.islink(file_path):
                    self.send_error_response(500, 'cannot download %s, it is a link to directory' % (file_path))
                    return
                self.send_response(202)
                self.send_header('Content-type', 'text/html')
                self.end_headers()

                self.wfile.write(json.dumps(list_directory_contents(file_path)))
            else:
                # 如果文件不存在，则返回404错误
                self.send_error(404)

class ThreadedHTTPServer(ThreadingMixIn, TCPServer):
    pass
# 创建一个简单的 HTTP 服务器
httpd = ThreadedHTTPServer(('0.0.0.0', {port}), MyHTTPRequestHandler)
print 'Start server success'
httpd.serve_forever()
"""'''

python3_start_server_str = '''"""
# -*- coding: utf-8 -*-
import http.server
from socketserver import ThreadingMixIn, TCPServer
import os
import json
from urllib.parse import unquote

def list_directory_contents(path):
    def _list_contents(path, indent=0):
        entries = []
        try:
            for entry in os.listdir(path):
                entry_path = os.path.join(path, entry)
                if os.path.isdir(entry_path):
                    entries.append(('D', entry, _list_contents(entry_path, indent + 1)))
                else:
                    entries.append(('F', entry))
        except OSError as e:
            pass
        return entries

    return _list_contents(path)


class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    # 设置根目录，默认为当前目录
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def log_message(self, format, *args):
        # 不执行任何操作，从而禁用日志
        pass

    def send_error_response(self, code, message=None):
        if message:
            self.send_response(code)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(message.encode('utf-8'))
        else:
            self.send_error(code)

    def do_GET(self):
        ip = self.client_address
        # super().do_GET()
        # 获取请求的路径
        raw_path = self.path
        path = unquote(raw_path)

        # 分离路径和查询字符串
        query_start = path.find('?')
        if query_start != -1:
            query_string = path[query_start + 1:]
            file_path = path[:query_start]
        else:
            self.send_error(404, 'File Not Found')
            return

        # 解析查询字符串
        query_params = dict()
        for param in query_string.split('&'):
            key_value = param.split('=')
            if len(key_value) == 2:
                key, value = key_value
                query_params[key] = value

        if query_params.get('token') != '{token}':
            self.send_error(404, 'File Not Found')
            return

        type = query_params.get('type')
        if type == 'getFileSize':
            try:
                self.send_response(200)
                self.send_header('Content-type', 'text/plain')
                self.end_headers()
                if not os.path.exists(file_path):
                    file_size = 0
                else:
                    file_size = os.path.getsize(file_path)
                self.wfile.write(str(file_size))
            except FileNotFoundError:
                self.send_response(500)
                self.wfile.write('0')
        else:
            # 检查路径是否指向一个有效的文件
            if os.path.isfile(file_path):
                # 设置响应头
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()

                # 打开文件并读取内容
                with open(file_path, 'rb') as file:
                    self.wfile.write(file.read())
            elif os.path.isdir(file_path):
                if os.path.islink(file_path):
                    self.send_error_response(500, 'cannot download %s, it is a link to directory' % (file_path))
                    return
                self.send_response(202)
                self.send_header('Content-type', 'text/html')
                self.end_headers()

                self.wfile.write(json.dumps(list_directory_contents(file_path)).encode('utf-8'))
            else:
                # 如果文件不存在，则返回404错误
                self.send_error(404, 'File Not Found')
class ThreadedHTTPServer(ThreadingMixIn, TCPServer):
    pass
# 创建一个简单的 HTTP 服务器
httpd = ThreadedHTTPServer(('0.0.0.0', {port}), MyHTTPRequestHandler)
print('Start server success')
httpd.serve_forever()
"""'''


class py_server_sftp_file_transfer(BaseTransfer):
    chunk_size = 200
    remote_py_cmd = ""
    remote_py_version = 0

    def __init__(self, worker):
        super().__init__(worker)
        self.remote_server = None

        self._start_remote_http_server()

    def _get_remote_host(self):
        cmd = r"hostname -I | tr ' ' '\\n' | grep -v '^172\.' | grep -v '^0\.' | xargs"
        match = self.worker.execute_implicit_command(cmd, pattern=host_pattern)
        return match.group(0).decode('utf-8')

    def _get_remote_unavailable_port(self):
        cmd = '''python -c \'\'\'
import socket

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    # 绑定到任意端口
    sock.bind(("localhost", 0))
    # 获取分配的端口号
    available_port = sock.getsockname()[1]
    print("Port %d is unavailable" % available_port)
finally:
    sock.close()
\'\'\''''
        match = self.worker.execute_implicit_command(cmd, pattern=port_pattern)
        return int(match.group(1))

    def _handle_python_cmd_and_version(self):
        if self.remote_py_version > 0:
            return
        def check(data):
            if b'command not found' in data:
                return True
            if py_version_pattern.search(data):
                return True
            return False
        output = self.worker.execute_implicit_command('python -V', func=check)
        if b'command not found' not in output:
            self.remote_py_cmd = 'python'
            match = py_version_pattern.search(output)
            self.remote_py_version = int(match.group(1))
            return
        output = self.worker.execute_implicit_command('python3 -V', func=check)
        if b'command not found' not in output:
            self.remote_py_cmd = 'python3'
            self.remote_py_version = 3
            return
        output = self.worker.execute_implicit_command('python2 -V', func=check)
        if b'command not found' not in output:
            self.remote_py_cmd = 'python2'
            self.remote_py_version = 2
            return

    def _start_remote_http_server(self):
        if self.remote_server:
            return
        self.remote_server = dict()
        token = str(uuid.uuid1())
        self.remote_server['token'] = token
        self._handle_python_cmd_and_version()

        while True:
            port = self._get_remote_unavailable_port()
            if self.remote_py_version == 3:
                py_code = python3_start_server_str.format(token=token, port=port)
            elif self.remote_py_version == 2:
                py_code = python2_start_server_str.format(token=token, port=port)
            else:
                logging.debug("cannot find python cmd")
                raise Exception("cannot find python cmd")
            match = self.worker.recv_util_match_exp(
                f'echo -e {py_code} | {self.remote_py_cmd} & builtin history -d $((HISTCMD-1))',
                re.compile(b'(Address already in use)|(Start server success.*Start server success)',
                           flags=re.MULTILINE | re.DOTALL), show_on_term=False)
            if match.group(2) is not None:
                break

        self.remote_server['port'] = port
        self.remote_server['host'] = self._get_remote_host()

    async def _upload_progress(self, upload_local_path, remote_path):
        file_size = os.path.getsize(upload_local_path)
        last_uploaded_size = 0
        id = gen_id()
        while True:
            url = "http://{}:{}/{}?token={}&type={}".format(self.remote_server["host"], self.remote_server["port"],
                                                            remote_path, self.remote_server["token"], "getFileSize")
            response = requests.get(url)
            uploaded_size = int(response.text)

            if last_uploaded_size > uploaded_size == 0:
                self.worker.handler.write_message({
                    "type": "message",
                    "status": "error",
                    "content": "maybe remote file is deleted"
                })
                break
            self.worker.handler.write_message({
                'type': 'execSessionMethod',
                'method': 'refreshFileProgressInfo',
                'args': {
                    'id': id,
                    'filePath': remote_path,
                    'percent': uploaded_size * 100 / file_size
                },
            })
            if uploaded_size == file_size:
                break
            last_uploaded_size = uploaded_size
            await asyncio.sleep(0.1)

    def _upload_single_file(self, upload_local_path, remote_path):
        local_server = start_local_server()
        download_url = f'http://{local_server["local_ip"]}:{local_server["port"]}/{upload_local_path}?token={local_server["token"]}'
        out = self.worker.execute_implicit_command(f"setsid wget -q -O '{remote_path}' '{download_url}' || rm -f '{remote_path}'")
        # out = self.worker.recv_util(f"wget -q -O '{remote_path}' '{download_url}' || rm -f '{remote_path}'", b'\x1b]0', show_on_term=False)
        if b_is_error(out):
            lines = out.decode(self.worker.encoding).split('\n')
            msg_lines = lines[1:-1]
            msg = '\n'.join(msg_lines)
            self.worker.handler.write_message({
                "type": "message",
                "status": "error",
                "content": msg
            })
        else:
            asyncio.create_task(self._upload_progress(upload_local_path, remote_path))

    def upload_files_by_server(self, file_info_list, remote_path):
        for file_info in file_info_list:
            local_path = file_info["path"]
            if os.path.isdir(local_path):
                directory_name = os.path.basename(local_path)
                for root, dirs, files in os.walk(local_path):
                    extra_dirname = root.removeprefix(local_path).replace(os.path.sep, "/")
                    remote_dir = remote_path + "/" + directory_name + "/" + extra_dirname
                    self.create_remote_directory(remote_dir)
                    for file_name in files:
                        upload_local_path = os.path.join(root, file_name)
                        self._upload_single_file(upload_local_path, self.get_remote_path(remote_dir, file_name))
            else:
                self._upload_single_file(local_path, self.get_remote_path(remote_path, file_info["name"]))

    def upload_files(self, files, remote_path):
        self.upload_files_by_server(files, remote_path)

    def _download_directories(self, local_root_dir, dir_name, remote_dir, tree):
        cur_dir_path = os.path.join(local_root_dir, dir_name)
        os.makedirs(cur_dir_path, exist_ok=True)
        cur_remote_dir_path = os.path.join(remote_dir, dir_name)
        for entry in tree:
            if entry[0] == 'F':
                # file
                self.download_single_file(cur_dir_path, entry[1], cur_remote_dir_path)
            elif entry[0] == 'D':
                # directory
                self._download_directories(cur_dir_path, entry[1], cur_remote_dir_path, entry[2])

    async def _download_progress(self, local_path, remote_path):
        url = "http://{}:{}/{}?token={}&type={}".format(self.remote_server["host"], self.remote_server["port"],
                                                        remote_path, self.remote_server["token"], "getFileSize")
        response = requests.get(url)
        file_size = int(response.text)

        last_download_size = 0
        id = gen_id()
        while True:
            download_size = os.path.getsize(local_path)

            if last_download_size > download_size == 0:
                self.worker.handler.write_message({
                    "type": "message",
                    "status": "error",
                    "content": "maybe download file is deleted"
                })
                break
            self.worker.handler.write_message({
                'type': 'execSessionMethod',
                'method': 'refreshFileProgressInfo',
                'args': {
                    'id': id,
                    'filePath': local_path,
                    'percent': int(download_size * 100 / file_size)
                },
            })
            if download_size == file_size:
                break
            last_download_size = download_size
            await asyncio.sleep(0.1)

    async def download_single_file_chunk(self, response, local_file_path):
        with open(local_file_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=10 * 1024 * 1024):
                if chunk:
                    f.write(chunk)
                    await asyncio.sleep(0.1)

    def download_single_file(self, local_root_dir, file, remoteDir):
        url = "http://{}:{}/{}/{}?token={}".format(self.remote_server["host"], self.remote_server["port"], remoteDir,
                                                   file, self.remote_server["token"])
        # url = quote(url)
        response = requests.get(url, stream=True, timeout=3)
        if response.status_code == 200:
            # 打开文件以二进制模式写入
            with open(os.path.join(local_root_dir, file), 'wb') as f:
                pass
            asyncio.create_task(self.download_single_file_chunk(response, os.path.join(local_root_dir, file)))
            asyncio.create_task(self._download_progress(os.path.join(local_root_dir, file), remoteDir + "/" + file))
                # await asyncio.sleep(0.1)
        elif response.status_code == 202:
            tree = response.json()
            self._download_directories(local_root_dir, file, remoteDir, tree)
        else:
            self.worker.handler.write_message({
                "type": "message",
                "status": "error",
                "content": response.text
            })

    def _download_files(self, local_root_dir, files, remoteDir):
        for file in files:
            self.download_single_file(local_root_dir, file, remoteDir)

    def download_files(self, local_root_dir, files, remoteDir):
        try:
            self._download_files(local_root_dir, files, remoteDir)
        except Exception as e:
            self.worker.handler.write_message({
                "type": "message",
                "status": "error",
                "content": str(e)
            })

    def close(self):
        pass
