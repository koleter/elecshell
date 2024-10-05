import asyncio
import os
import stat

from filetransfer.base_transfer import BaseTransfer


class sftp_file_transfer(BaseTransfer):
    def __init__(self, worker):
        super().__init__(worker)
        # 创建 SFTP 客户端
        self.sftp = worker.ssh.open_sftp()


    def get_remote_file_list(self, remote_path):
        # 获取远程路径下的文件和文件夹属性列表
        file_list = self.sftp.listdir_attr(remote_path)
        ret = []

        for file in file_list:
            item = dict()
            item.setdefault("title", file.filename)
            item.setdefault("key", file.filename)
            item.setdefault("isLeaf", not stat.S_ISDIR(file.st_mode))
            ret.append(item)
        ret.sort(key=lambda x: (x["isLeaf"], x["title"]))
        return ret


    def _create_remote_directory(self, path):
        """递归创建远程目录"""
        try:
            # 目录不存在，递归创建上级目录
            head, tail = os.path.split(path)
            self.sftp.chdir(head)
        except IOError:
            if head and tail:
                self._create_remote_directory(head)
                self.sftp.mkdir(head)
            elif tail:
                self.sftp.mkdir(tail)


    async def _upload_single_file(self, local_path, remote_path):
        self._create_remote_directory(remote_path)
        try:
            self.sftp.put(local_path, remote_path)
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
        self.sftp.close()
