import asyncio
import binascii
import logging
import os
import stat
import re

from filetransfer.base_transfer import BaseTransfer

from server.handler.const import BUF_SIZE

ls_pattern = r'([\-dlbcps])([rwx\-]{8}[rwxtT\-])([\.\+])\s+(\d+)\s+(\w+)\s+(\w+)\s+(\d+)\s+(.+\s+\d+\s+\d+(:\d+)?)\s+(.+)\r'
port_pattern = re.compile(r'Port (\d+) is available')

class py_server_sftp_file_transfer(BaseTransfer):

    chunk_size = 200
    remote_py_version = 0

    def __init__(self, worker):
        super().__init__(worker)


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


    def get_remote_file_list(self, remote_path):
        def h(ctx, output, worker):
            if output:
                ret = []
                tp_list = re.findall(ls_pattern, output)
                for file_info in tp_list:
                    # file_info is a tuple like this: ('d', 'r-xr-xr-x', '.', '28', 'root', 'root', '4096', '6月   9 17:58', '.')
                    file_name = file_info[9]
                    if file_name == "." or file_name == "..":
                        continue
                    file_type = file_info[0]
                    if file_type == "l":
                        file_name = file_name.split(" -> ")[0]
                    item = dict()
                    item.setdefault("title", file_name)
                    item.setdefault("key", file_name)
                    item.setdefault("isLeaf", file_type != 'd')
                    ret.append(item)
                # print(output)
                ret.sort(key=lambda x: (x["isLeaf"], x["title"]))
                worker.handler.write_message({
                    'args': ret,
                    'method': 'refreshRemoteFileList',
                    'type': 'execSessionMethod'
                }, binary=False)

        # 获取远程路径下的文件和文件夹属性列表
        self.worker.recv(f'ls -al {remote_path}; builtin history -d $((HISTCMD-1))\r', h, [self.worker], show_on_term=False)


    def _get_python_cmd(self):
        if self.remote_py_version > 0:
            return f'python{self.remote_py_version}'
        output = self.worker.recv(f'python3; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
        if not 'command not found' in output:
            self.remote_py_version = 3
            return 'python3'
        output = self.worker.recv(f'python2; builtin history -d $((HISTCMD-1))\r', show_on_term=False)
        if not 'command not found' in output:
            self.remote_py_version = 2
            return 'python2'


    def _create_remote_directory(self, path):
        """递归创建远程目录"""
        self.worker.recv(f'mkdir -p {path}; builtin history -d $((HISTCMD-1))\r', show_on_term=False)


    async def _upload_single_file_by_shell(self, local_path, remote_path):
        with open(local_path, 'rb') as f:
            while True:
                data = f.read(self.chunk_size)
                if not data:
                    break
                formatted_data = ''.join(['\\x{:02x}'.format(byte) for byte in data])
                self.worker.recv(f"printf '{formatted_data}' >> {remote_path}; builtin history -d $((HISTCMD-1))\r", show_on_term=False)


    async def _upload_single_file_by_server(self, local_path, remote_path):
        self.worker.recv(f"printf '{formatted_data}' >> {remote_path}; builtin history -d $((HISTCMD-1))\r", show_on_term=False)


    def _upload_files_by_shell(self, files, remote_path):
        for file_info in files:
            local_path = file_info["path"]
            if os.path.isdir(local_path):
                directory_name = os.path.basename(local_path)
                for root, dirs, files in os.walk(local_path):
                    extra_dirname = root.removeprefix(local_path).replace(os.path.sep, "/")
                    remote_dir = remote_path + "/" + directory_name + "/" + extra_dirname
                    self._create_remote_directory(remote_dir)
                    for file_name in files:
                        upload_local_path = os.path.join(root, file_name)
                        asyncio.create_task(self._upload_single_file_by_shell(upload_local_path, remote_dir + "/" + file_name))
            else:
                asyncio.create_task(self._upload_single_file_by_shell(local_path, remote_path + "/" + file_info["name"]))


    def _start_remote_http_server(self, port, dir):
        py_cmd = self._get_python_cmd()
        if py_cmd == 'python3':
            self.worker.recv(f'{py_cmd} -m http.server {port} --directory {dir}')
        elif py_cmd == 'python2':
            self.worker.recv(f'{py_cmd} -m SimpleHTTPServer {port} --directory {dir}')
        else:
            logging.debug("cannot find python cmd")
            raise Exception("cannot find python cmd")

    def upload_files_by_server(self, files, remote_path):
        port = self._get_remote_available_port()
        for file_info in files:
            local_path = file_info["path"]
            if os.path.isdir(local_path):
                directory_name = os.path.basename(local_path)
                for root, dirs, files in os.walk(local_path):
                    extra_dirname = root.removeprefix(local_path).replace(os.path.sep, "/")
                    remote_dir = remote_path + "/" + directory_name + "/" + extra_dirname
                    self._create_remote_directory(remote_dir)
                    self._start_remote_http_server(port, remote_dir)
                    for file_name in files:
                        upload_local_path = os.path.join(root, file_name)
                        asyncio.create_task(self._upload_single_file(upload_local_path, remote_dir + "/" + file_name))
            else:
                self._start_remote_http_server(port, remote_path)
                asyncio.create_task(self._upload_single_file(local_path, remote_path + "/" + file_info["name"]))


    def upload_files(self, files, remote_path):
        for file_info in files:
            local_path = file_info["path"]
            if os.path.isdir(local_path):
                directory_name = os.path.basename(local_path)
                for root, dirs, files in os.walk(local_path):
                    extra_dirname = root.removeprefix(local_path).replace(os.path.sep, "/")
                    remote_dir = remote_path + "/" + directory_name + "/" + extra_dirname
                    self._create_remote_directory(remote_dir)
                    for file_name in files:
                        upload_local_path = os.path.join(root, file_name)
                        asyncio.create_task(self._upload_single_file(upload_local_path, remote_dir + "/" + file_name))
            else:
                asyncio.create_task(self._upload_single_file(local_path, remote_path + "/" + file_info["name"]))


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
        for file in files:
            self.download_single_file(local_root_dir, file, remoteDir)


    def close(self):
        pass
