import os.path
import shutil
import threading

from handler.const import OPERATION_SUCCESS
from handler.pojo.status import status_success, status_error
from utils import gen_id


class BaseConfig:
    def __init__(self, path):
        if not os.path.exists(path):
            os.makedirs(path)
        self.path = path
        self.lock = threading.Lock()

    def _get_real_path(self, path):
        return os.path.join(self.path, path)

    def get(self, args):
        raise Exception("not adapted method get")

    def post(self, args):
        type = args['type']
        if type == 'createDir':
            fake_path = args['path']
            real_path = self._get_real_path(fake_path)
            if os.path.exists(real_path):
                return status_error("dir {} already exists".format(fake_path))
            os.makedirs(real_path)
            return status_success("create dir success")
        elif type == 'addFile':
            file_name = gen_id()
            dir = args['dir']
            absolute_path = os.path.join(self.path, dir, file_name)
            if os.path.exists(absolute_path):
                return status_error("session {} already exists".format(file_name))
            with open(absolute_path, 'w') as f:
                f.write(args['content'])
            return status_success(OPERATION_SUCCESS)
        elif type == 'writeFile':
            path = self._get_real_path(args['path'])
            with open(path, 'w') as f:
                f.write(args['content'])
            return status_success(OPERATION_SUCCESS)
        elif type == 'deleteFile':
            path = self._get_real_path(args['path'])
            if os.path.isdir(path):
                shutil.rmtree(path)
            else:
                os.remove(path)
            return status_success(OPERATION_SUCCESS)
        elif type == 'renameDir':
            src = self._get_real_path(args['src'])
            dst_file_name = os.path.dirname(src)
            dst = os.path.join(self.path, dst_file_name, args['dst'])
            if os.path.exists(dst):
                return status_error("dir {} already exists".format(dst))
            os.rename(src, dst)
            return status_success(OPERATION_SUCCESS)
        elif type == 'moveFileOrDir':
            src = self._get_real_path(args['src'])
            name = src[src.rfind("\\") + 1:]
            dst = self._get_real_path(args['dst'])
            if os.path.isfile(dst):
                dst = os.path.dirname(dst)
            dst_file_name = os.path.join(dst, name)
            if os.path.exists(dst_file_name):
                return status_error("dir {} already exists".format(dst))
            shutil.move(src, dst_file_name)
            return status_success(OPERATION_SUCCESS)
        elif type == 'readFile':
            path = self._get_real_path(args['path'])
            with open(path, 'r') as f:
                return {
                    'status': 'success',
                    'content': f.read()
                }
        return status_error("unknown exception")
