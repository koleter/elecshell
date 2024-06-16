import asyncio
import os
import stat


from filetransfer.base_transfer import BaseTransfer

class py_server_sftp_file_transfer(BaseTransfer):

    chunk_size = 200
    remote_py_version = 0

    def __init__(self, worker):
        super().__init__(worker)


    async def _upload_single_file(self, local_path, remote_path):
        with open(local_path, 'rb') as f:
            while True:
                data = f.read(self.chunk_size)
                if not data:
                    break
                formatted_data = ''.join(['\\x{:02x}'.format(byte) for byte in data])
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


    def upload_files(self, files, remote_path):
        self._upload_files_by_shell(files, remote_path)


    def get_file_from_remote_server(self, remote_file_path, local_root_dir):
        pass

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
