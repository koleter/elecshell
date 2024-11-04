import logging
import os
import re
import stat
import uuid

from filetransfer.base_transfer import BaseTransfer
from util.error import b_is_error
from util.local_server import start_local_server

port_pattern = re.compile(b'Port (\\d+) is available')


class py_server_sftp_file_transfer(BaseTransfer):
    chunk_size = 200
    remote_py_version = 0

    def __init__(self, worker):
        super().__init__(worker)
        self.local_server = None
        self.remote_server = None

    def _get_remote_available_port(self):
        # def h(ctx, output):
        #     match = port_pattern.search(output)
        #     return match.group(1)

        cmd = '''python -c \'\'\'
import socket
import sys

for port in range(10000, 25000):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    result = sock.connect_ex(("localhost", port))
    if result != 0:
        print("Port %d is available" % port)
        sys.exit(0)
\'\'\''''
        output = self.worker.recv(f'{cmd}; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
        match = port_pattern.search(output)
        return match.group(1)

    def _get_python_cmd(self):
        if self.remote_py_version > 0:
            return f'python{self.remote_py_version}'
        output = self.worker.recv(f'python3; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
        if not b'command not found' in output:
            self.remote_py_version = 3
            return 'python3'
        output = self.worker.recv(f'python2; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
        if not b'command not found' in output:
            self.remote_py_version = 2
            return 'python2'

    def _start_remote_http_server(self):
        if self.remote_server:
            return
        port = self._get_remote_available_port()
        py_cmd = self._get_python_cmd()

        self.remote_server = dict()
        self.remote_server['port'] = port
        self.remote_server['host'] = self.work.dst_addr[0]
        token = str(uuid.uuid1())
        self.remote_server['token'] = token

        if self.remote_py_version == 3:
            self.worker.execute_implicit_command(f'{py_cmd} -m http.server {port} --directory / &')
        elif self.remote_py_version == 2:
            self.worker.execute_implicit_command(f'{py_cmd} -m SimpleHTTPServer {port} --directory / &')
        else:
            logging.debug("cannot find python cmd")
            raise Exception("cannot find python cmd")


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
        remote_file_path = remoteDir + "/" + file
        file_info_list = self.sftp.listdir_attr(remoteDir)
        for file_info in file_info_list:
            if not file_info.filename == file:
                continue
            if stat.S_ISDIR(file_info.st_mode):
                next_local_dir = os.path.join(local_root_dir, file)
                os.mkdir(next_local_dir)
                self._download_directories(next_local_dir, remoteDir + "/" + file)
            else:
                self.get_file_from_remote_server(remoteDir + "/" + file, os.path.join(local_root_dir, file))
            break

    def download_files(self, local_root_dir, files, remoteDir):
        self._start_remote_http_server()
        for file in files:
            self.download_single_file(local_root_dir, file, remoteDir)

    def close(self):
        pass
        # if self.remote_server_port:
        #     self.worker.execute_implicit_command(f'lsof -t -i:{self.remote_server_port.port} | xargs -r kill -9')
        # for root_dir, server_info in self.local_servers.items():
        #     server_info.get('httpd').shutdown()

