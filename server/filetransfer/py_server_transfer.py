import asyncio
import logging
import os
import re
import stat
import uuid

import requests
from filetransfer.base_transfer import BaseTransfer
from util.error import b_is_error
from util.local_server import start_local_server

port_pattern = re.compile(b'Port (\\d+) is unavailable')
py_version_pattern = re.compile(b'Python (\\d)\\.')
host_pattern = re.compile(b'((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)')

python2_start_server_str = '''"""
# -*- coding: utf-8 -*-
import SimpleHTTPServer
import SocketServer
import os
import urlparse

class MyHTTPRequestHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):
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

        # 输出查询参数
        print 'Query parameters:', query_params
        if query_params.get('token') != '{token}':
            self.send_error(404)
            return

        # 检查路径是否指向一个有效的文件
        if os.path.isfile(file_path):
            # 设置响应头
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
        else:
            # 如果文件不存在，则返回404错误
            self.send_error(404)

# 创建一个简单的 HTTP 服务器
httpd = SocketServer.TCPServer(('0.0.0.0', {port}), MyHTTPRequestHandler)
print 'Start server success'
httpd.serve_forever()
"""'''

python3_start_server_str = '''"""
import http.server
import socketserver
import os


class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    # 设置根目录，默认为当前目录
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

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

        # 输出查询参数
        print('Query parameters:', query_params)
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
        cmd = "hostname -I | tr ' ' '\\n' | grep -v '^172\.' | xargs"
        match = self.worker.execute_implicit_command(cmd, pattern=host_pattern)
        return match.group(0).decode('utf-8')

    def _get_remote_unavailable_port(self, start_port):
        cmd = '''python -c \'\'\'
import socket
import sys

for port in range({start_port}, 60000):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(("localhost", port))
    if result == 0:
        print("Port %d is unavailable" % port)
        sys.exit(0)
\'\'\''''.format(start_port=start_port)
        match = self.worker.execute_implicit_command(cmd, pattern=port_pattern)
        # output = self.worker.recv(f'{cmd}; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
        # match = port_pattern.search(output)
        return int(match.group(1))

    def _handle_python_cmd_and_version(self):
        if self.remote_py_version > 0:
            return
        output = self.worker.recv(f'python -V; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
        if not b'command not found' in output:
            self.remote_py_cmd = 'python'
            match = py_version_pattern.search(output)
            self.remote_py_version = int(match.group(1))
            return
        output = self.worker.recv(f'python3 -V; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
        if not b'command not found' in output:
            self.remote_py_cmd = 'python3'
            self.remote_py_version = 3
            return
        output = self.worker.recv(f'python2 -V; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
        if not b'command not found' in output:
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

        port = 10000
        while True:
            port = self._get_remote_unavailable_port(port+1)
            if self.remote_py_version == 3:
                py_code = python3_start_server_str.format(token=token, port=port)
            elif self.remote_py_version == 2:
                py_code = python2_start_server_str.format(token=token, port=port)
            else:
                logging.debug("cannot find python cmd")
                raise Exception("cannot find python cmd")
            match = self.worker.recv_util_match_exp(f'({self.remote_py_cmd} -c {py_code} & builtin history -d $((HISTCMD-1)))', re.compile(b'(Address already in use)|(Start server success.*Start server success)'), show_on_term=True)
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

    def _download_directories(self, local_root_dir, remoteDir):
        for file_info in self.sftp.listdir_attr(remoteDir):
            remote_file_path = remoteDir + "/" + file_info.filename
            if stat.S_ISDIR(file_info.st_mode):
                next_local_dir = os.path.join(local_root_dir, file_info.filename)
                os.mkdir(next_local_dir)
                self._download_directories(next_local_dir, remote_file_path)
            else:
                self.get_file_from_remote_server(remote_file_path, os.path.join(local_root_dir, file_info.filename))

    def download_single_file(self, local_root_dir, file, remoteDir):
        url = "http://{}:{}/{}/{}".format(self.remote_server["host"], self.remote_server["port"], remoteDir, file)
        response = requests.get(url)
        print(response)

    def download_files(self, local_root_dir, files, remoteDir):
        self._start_remote_http_server()
        for file in files:
            self.download_single_file(local_root_dir, file, remoteDir)

    def close(self):
        self.remote_server = None
        # if self.remote_server_port:
        #     self.worker.execute_implicit_command(f'lsof -t -i:{self.remote_server_port.port} | xargs -r kill -9')
        # for root_dir, server_info in self.local_servers.items():
        #     server_info.get('httpd').shutdown()
