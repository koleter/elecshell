import asyncio
import logging
import os
import re
import uuid

import requests
from filetransfer.base_transfer import BaseTransfer
from util.error import b_is_error
from util.local_server import start_local_server

port_pattern = re.compile(b'Port (\\d+) is unavailable')
py_version_pattern = re.compile(b'Python (\\d)\\.')
host_pattern = re.compile(br'((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)')

python2_start_server_str = '''"""
# -*- coding: utf-8 -*-
import SimpleHTTPServer
import SocketServer
import os
import urlparse
import json

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

    def do_GET(self):
        # 获取请求的路径
        path = self.path

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
            self.send_response(202)
            self.send_header('Content-type', 'text/html')
            self.end_headers()

            self.wfile.write(json.dumps(list_directory_contents(file_path)))
        else:
            # 如果文件不存在，则返回404错误
            self.send_error(404)

# 创建一个简单的 HTTP 服务器
httpd = SocketServer.TCPServer(('0.0.0.0', {port}), MyHTTPRequestHandler)
print 'Start server success'
httpd.serve_forever()
"""'''

python3_start_server_str = '''"""
# -*- coding: utf-8 -*-
import http.server
import socketserver
import os
import json

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

    def do_GET(self):
        ip = self.client_address
        # super().do_GET()
        # 获取请求的路径
        path = self.path

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
            self.send_response(202)
            self.send_header('Content-type', 'text/html')
            self.end_headers()

            self.wfile.write(json.dumps(list_directory_contents(file_path)).encode('utf-8'))
        else:
            # 如果文件不存在，则返回404错误
            self.send_error(404, 'File Not Found')

# 创建一个简单的 HTTP 服务器
httpd = socketserver.TCPServer(('0.0.0.0', {port}), MyHTTPRequestHandler)
print('Start server success')
httpd.serve_forever()
"""'''


class py_server_sftp_file_transfer(BaseTransfer):
    chunk_size = 200
    remote_py_cmd = ""
    remote_py_version = 0

    def __init__(self, worker):
        super().__init__(worker)
        self.local_server = None
        self.remote_server = None

    def _get_remote_host(self):
        cmd = r"hostname -I | tr ' ' '\\n' | grep -v '^172\.' | xargs"
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
        # output = self.worker.recv(f'{cmd}; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
        # match = port_pattern.search(output)
        return int(match.group(1))

    def _handle_python_cmd_and_version(self):
        if self.remote_py_version > 0:
            return
        output = self.worker.recv(f'python -V; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
        if b'command not found' not in output:
            self.remote_py_cmd = 'python'
            match = py_version_pattern.search(output)
            self.remote_py_version = int(match.group(1))
            return
        output = self.worker.recv(f'python3 -V; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
        if b'command not found' not in output:
            self.remote_py_cmd = 'python3'
            self.remote_py_version = 3
            return
        output = self.worker.recv(f'python2 -V; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
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
                f'{self.remote_py_cmd} -c {py_code} & builtin history -d $((HISTCMD-1))',
                re.compile(b'(Address already in use)|(Start server success.*Start server success)',
                           flags=re.MULTILINE | re.DOTALL), show_on_term=False)
            if match.group(2) is not None:
                break

        self.remote_server['port'] = port
        self.remote_server['host'] = self._get_remote_host()

    def _start_local_http_server(self):
        if self.local_server is None:
            token = str(uuid.uuid1())
            httpd, local_ip, port = start_local_server(token)
            self.local_server = {
                'httpd': httpd,
                'local_ip': local_ip,
                'port': port,
                'token': token
            }

    def _upload_single_file(self, upload_local_path, remote_path):
        local_server = self.local_server
        download_url = f'http://{local_server["local_ip"]}:{local_server["port"]}/{upload_local_path}?token={local_server["token"]}'
        out = self.worker.execute_implicit_command(f'wget -O {remote_path} {download_url} || rm -f {remote_path}')
        if b_is_error(out):
            lines = out.decode(self.worker.encoding).split('\n')
            msg_lines = lines[1:-1]
            msg = '\n'.join(msg_lines)
            self.worker.handler.write_message({
                "type": "message",
                "status": "error",
                "content": msg
            })

    def upload_files_by_server(self, file_info_list, remote_path):
        self._start_local_http_server()
        for file_info in file_info_list:
            local_path = file_info["path"]
            if os.path.isdir(local_path):
                directory_name = os.path.basename(local_path)
                for root, dirs, files in os.walk(local_path):
                    extra_dirname = root.removeprefix(local_path).replace(os.path.sep, "/")
                    remote_dir = remote_path + "/" + directory_name + "/" + extra_dirname
                    self._create_remote_directory(remote_dir)
                    for file_name in files:
                        upload_local_path = os.path.join(root, file_name)
                        self._upload_single_file(upload_local_path, self.get_remote_path(remote_dir, file_name))
            else:
                self._upload_single_file(local_path, self.get_remote_path(remote_path, file_info["name"]))

    def upload_files(self, files, remote_path):
        self.upload_files_by_server(files, remote_path)

    def get_file_from_remote_server(self, remote_file_path, local_root_dir):
        try:
            self.sftp.get(remote_file_path, local_root_dir)
        except Exception as e:
            self.worker.handler.write_message({
                "type": "message",
                "status": "error",
                "content": f'Failed to download file {remote_file_path} from remote server: {str(e)}'
            })

    def _download_directories(self, local_root_dir, dir_name, remote_dir, tree, tasks=[]):
        cur_dir_path = os.path.join(local_root_dir, dir_name)
        os.makedirs(cur_dir_path, exist_ok=True)
        cur_remote_dir_path = os.path.join(remote_dir, dir_name)
        for entry in tree:
            if entry[0] == 'F':
                # file
                tasks.append(self.download_single_file(cur_dir_path, entry[1], cur_remote_dir_path))
            elif entry[0] == 'D':
                # directory
                self._download_directories(cur_dir_path, entry[1], cur_remote_dir_path, entry[2], tasks)
        return tasks

    async def download_single_file(self, local_root_dir, file, remoteDir):
        url = "http://{}:{}/{}/{}?token={}".format(self.remote_server["host"], self.remote_server["port"], remoteDir,
                                                   file, self.remote_server["token"])
        response = requests.get(url, stream=True)
        if response.status_code == 200:
            # 打开文件以二进制模式写入
            with open(local_root_dir + "/" + file, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
        elif response.status_code == 202:
            tree = response.json()
            tasks = self._download_directories(local_root_dir, file, remoteDir, tree)
            await asyncio.gather(*tasks)
        else:
            self.worker.handler.write_message({
                "type": "message",
                "status": "error",
                "content": response.text
            })

    async def _download_files(self, local_root_dir, files, remoteDir):
        self._start_remote_http_server()
        tasks = [self.download_single_file(local_root_dir, file, remoteDir) for file in files]
        await asyncio.gather(*tasks)

    def download_files(self, local_root_dir, files, remoteDir):
        asyncio.create_task(self._download_files(local_root_dir, files, remoteDir))

    def close(self):
        pass
