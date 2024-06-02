import asyncio
import logging
import os
import stat
import uuid


class sftp_file_transfer():
    def __init__(self, worker):
        # 创建 SFTP 客户端
        self.file_transfer = worker.ssh.open_sftp()
        self.worker = worker


    def get_remote_file_list(self, remote_path):
        # 获取远程路径下的文件和文件夹属性列表
        file_list = self.file_transfer.listdir_attr(remote_path)
        ret = []
        # 打印文件列表
        for file in file_list:
            item = dict()
            item.setdefault("title", file.filename)
            item.setdefault("key", str(uuid.uuid1()))
            item.setdefault("isLeaf", not stat.S_ISDIR(file.st_mode))
            ret.append(item)
        ret.sort(key=lambda x: (x["isLeaf"], x["title"]))
        return ret


    def _create_remote_directory(self, path):
        """递归创建远程目录"""
        try:
            # 目录不存在，递归创建上级目录
            head, tail = os.path.split(path)
            self.file_transfer.chdir(head)
        except IOError:
            if head and tail:
                self._create_remote_directory(head)
                self.file_transfer.mkdir(head)
            elif tail:
                self.file_transfer.mkdir(tail)


    async def _upload_single_file(self, local_path, remote_path):
        self._create_remote_directory(remote_path)
        try:
            self.file_transfer.put(local_path, remote_path)
            print(f"Successfully uploaded {local_path} to {remote_path}")
        except Exception as e:
            print(f"Failed to upload {local_path} to {remote_path}: {str(e)}")
            e.with_traceback()


    def upload_files(self, files, remote_path):
        for file_info in files:
            local_path = file_info["path"]
            if os.path.isdir(local_path):
                directory_name = os.path.basename(local_path)
                for root, dirs, files in os.walk(local_path):
                    extra_dirname = root.removeprefix(local_path).replace(os.path.sep, "/")
                    for file_name in files:
                        upload_local_path = os.path.join(root, file_name)
                        asyncio.create_task(self._upload_single_file(upload_local_path, remote_path + "/" + directory_name + "/" + extra_dirname + "/" + file_name))
            else:
                asyncio.create_task(self._upload_single_file(local_path, remote_path + "/" + file_info["name"]))


    def download_files(self, local_path, remote_path):
        pass
        # self.file_transfer.

    def close(self):
        self.file_transfer.close()
