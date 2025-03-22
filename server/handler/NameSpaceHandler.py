import json
import os
import shutil
import uuid

import tornado.web

from constant.script import RUN_PY_SCRIPT
from handler.BaseHandler import BaseHandler
from handler.ConfigHandler import conf_dir_path
from settings import base_dir

class NameSpaceHandler(BaseHandler, tornado.web.RequestHandler):
    def initialize(self, loop):
        super(NameSpaceHandler, self).initialize(loop)

    def get(self):
        entries = os.listdir(conf_dir_path)
        # 过滤出目录
        directories = [entry for entry in entries if
                       os.path.isdir(os.path.join(conf_dir_path, entry))]
        self.write(json.dumps(directories, ensure_ascii=False))

    def post(self):
        data = json.loads(self.request.body)
        action_type = data.get('type')
        if action_type == "create":
            namespace = data.get('namespace')
            if not namespace:
                self.set_status(400)  # Bad Request
                self.write(json.dumps({"status": "error", "content": "Namespace is required"}))
                return
            os.mkdir(os.path.join(conf_dir_path, namespace))
            self.write(json.dumps({"status": "success", "content": "create namespace success"}))
        elif action_type == "import":
            namespace = data.get('namespace')
            namespace_path = os.path.join(conf_dir_path, namespace)
            if os.path.exists(namespace_path):
                self.write(json.dumps({"status": "error", "content": "namespace is already exist"}))
                return
            directoryPath = data.get('directoryPath')
            shutil.copytree(directoryPath, namespace_path)
            try:
                script_dir_path = os.path.join(namespace_path, "script")
                py_script_dir_path = os.path.join(namespace_path, "py_script")
                for root, dirs, files in os.walk(script_dir_path):
                    for script_path in files:
                        with open(os.path.join(root, script_path), 'r+', encoding='utf-8') as f:
                            data = json.loads(f.read())
                            if data.get("scriptType") == RUN_PY_SCRIPT:
                                data.update({"scriptPath": os.path.join(py_script_dir_path, data.get("scriptPath"))})
                                f.seek(0)
                                f.truncate()
                                f.write(json.dumps(data, ensure_ascii=False))


            except Exception as e:
                shutil.rmtree(namespace_path)
                self.write(json.dumps({"status": "error", "content": str(e)}))
                return
            self.write(json.dumps({"status": "success", "content": "import namespace success"}))
        elif action_type == "export":
            namespace = data.get('namespace')
            directoryPath = data.get('directoryPath')
            if os.path.exists(directoryPath):
                shutil.rmtree(directoryPath)
            os.mkdir(directoryPath)
            namespace_path = os.path.join(conf_dir_path, namespace)
            xsh_path = os.path.join(namespace_path, "xsh")
            if not os.path.exists(xsh_path):
                self.write(json.dumps({"status": "error", "content": "empty namespace"}))
                return
            shutil.copytree(xsh_path, os.path.join(directoryPath, "xsh"))
            script_path = os.path.join(namespace_path, "script")
            if os.path.exists(script_path):
                script_py_path = os.path.join(directoryPath, "py_script")
                os.mkdir(script_py_path)
                dst_script_path = os.path.join(directoryPath, "script")
                os.mkdir(dst_script_path)
                for root, dirs, files in os.walk(script_path):
                    for file_name in files:
                        src_file_path = os.path.join(root, file_name)
                        with open(src_file_path, 'r') as f:
                            data = json.loads(f.read())
                        if data.get("scriptType") == RUN_PY_SCRIPT:
                            script_path = data.get("scriptPath")
                            random_uuid = str(uuid.uuid4())
                            dst_py_file_path = os.path.join(script_py_path, random_uuid)
                            shutil.copy(script_path, dst_py_file_path)
                            data.update({"scriptPath": random_uuid})
                        with open(os.path.join(dst_script_path, file_name), 'w', encoding='utf-8') as f:
                            f.write(json.dumps(data, ensure_ascii=False))
            self.write(json.dumps({"status": "success", "content": "export namespace success"}))

    def delete(self):
        '''
        delete an existing namespace
        :return:
        '''
        data = json.loads(self.request.body)
        namespace = data.get('namespace')

        if not namespace:
            self.write(json.dumps({"status": "error", "content": "Namespace is required"}))
            return

        namespace_path = os.path.join(conf_dir_path, namespace)

        if not os.path.exists(namespace_path):
            self.write(json.dumps({"status": "error", "content": "Namespace does not exist"}))
            return

        try:
            shutil.rmtree(namespace_path)  # 使用 shutil.rmtree 删除目录及其内容
            self.write(json.dumps({"status": "success", "content": "删除命名空间成功"}))
        except Exception as e:
            self.write(json.dumps({"status": "error", "content": str(e)}))
