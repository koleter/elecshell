import json
import os
import shutil

import tornado.web

from handler.MixinHandler import MixinHandler
from handler.ConfigHandler import conf_dir_path


class NameSpaceHandler(MixinHandler, tornado.web.RequestHandler):
    def initialize(self, loop):
        super(NameSpaceHandler, self).initialize(loop)

    def get(self):
        entries = os.listdir(conf_dir_path)
        # 过滤出目录
        directories = [entry for entry in entries if
                       os.path.isdir(os.path.join(conf_dir_path, entry))]
        self.write(json.dumps(directories))

    def post(self):
        '''
        create a new namespace
        :return:
        '''
        data = json.loads(self.request.body)
        namespace = data.get('namespace')
        if not namespace:
            self.set_status(400)  # Bad Request
            self.write(json.dumps({"status": "error", "content": "Namespace is required"}))
            return
        os.mkdir(os.path.join(conf_dir_path, namespace))
        self.write(json.dumps({"status": "success", "content": "创建命名空间成功"}))

    def delete(self):
        '''
        delete an existing namespace
        :return:
        '''
        data = json.loads(self.request.body)
        namespace = data.get('namespace')

        if not namespace:
            self.set_status(400)  # Bad Request
            self.write(json.dumps({"status": "error", "content": "Namespace is required"}))
            return

        namespace_path = os.path.join(conf_dir_path, namespace)

        if not os.path.exists(namespace_path):
            self.set_status(404)  # Not Found
            self.write(json.dumps({"status": "error", "content": "Namespace does not exist"}))
            return

        try:
            shutil.rmtree(namespace_path)  # 使用 shutil.rmtree 删除目录及其内容
            self.write(json.dumps({"status": "success", "content": "删除命名空间成功"}))
        except Exception as e:
            self.set_status(500)  # Internal Server Error
            self.write(json.dumps({"status": "error", "content": str(e)}))
