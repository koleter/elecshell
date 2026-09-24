import json
import logging
import os

import tornado.web
from handler.BaseHandler import BaseHandler
from handler.pojo.conf.GlobalAutoConfig import GlobalAutoConfig
from handler.pojo.conf.ProjectConfig import ProjectConfig
from handler.pojo.conf.ScriptConfig import ScriptConfig
from handler.pojo.conf.SessionConfig import SessionConfig
from handler.pojo.conf.ConfigableProjectConfig import ConfigableProjectConfig

from settings import base_dir

# 定义全局变量
conf_dir_path = os.path.join(base_dir, 'config')
# 项目配置，记录当前使用的项目名称，语言等
project_config = ProjectConfig(conf_dir_path)

xsh_dir_path = None
configable_project_config = None
handler_map = {}


def initialize_confs():
    global configable_project_config, handler_map, xsh_dir_path

    namespace = project_config.conf_cache.get("namespace")
    namespace_dir_path = os.path.join(conf_dir_path, namespace)

    xsh_dir_path = os.path.join(namespace_dir_path, 'xsh')
    script_dir_path = os.path.join(namespace_dir_path, 'script')
    global_dir_path = os.path.join(namespace_dir_path, 'global')

    configable_project_config = ConfigableProjectConfig(global_dir_path)

    handler_map = {
        'SessionConfig': SessionConfig(xsh_dir_path),
        'ScriptConfig': ScriptConfig(script_dir_path),
        'GlobalAutoConfig': GlobalAutoConfig(global_dir_path),
        'ConfigableProjectConfig': configable_project_config,
        'ProjectConfig': project_config
    }


# 调用初始化函数
initialize_confs()


class ConfigHandler(BaseHandler, tornado.web.RequestHandler):
    def initialize(self, loop):
        super(ConfigHandler, self).initialize(loop)
        self.script = None

    def get(self):
        type = self.get_argument('type')
        self.write(json.dumps(handler_map.get(type).get(), ensure_ascii=False))


    def post(self):
        data = json.loads(self.request.body)
        type = data['type']
        args = data['args']
        self.write(json.dumps(handler_map.get(type).post(args), ensure_ascii=False))
