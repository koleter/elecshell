import json
import os

import tornado.web
from handler.MixinHandler import MixinHandler
from handler.pojo.conf.GlobalAutoConfig import GlobalAutoConfig
from handler.pojo.conf.ScriptConfig import ScriptConfig
from handler.pojo.conf.SessionConfig import SessionConfig
from settings import base_dir


conf_dir_path = os.path.join(base_dir, 'config')
xsh_dir_path = os.path.join(conf_dir_path, 'xsh')
script_dir_path = os.path.join(conf_dir_path, 'script')
global_dir_path = os.path.join(conf_dir_path, 'global')

handler_map = {
    'SessionConfig': SessionConfig(xsh_dir_path),
    'ScriptConfig': ScriptConfig(script_dir_path),
    'GlobalAutoConfig': GlobalAutoConfig(global_dir_path)
}


class ConfigHandler(MixinHandler, tornado.web.RequestHandler):
    def initialize(self, loop):
        super(ConfigHandler, self).initialize(loop)
        self.script = None

    def get(self):
        type = self.get_argument('type')
        self.write(json.dumps(handler_map.get(type).get()))

    def post(self):
        data = json.loads(self.request.body)
        type = data['type']
        args = data['args']
        self.write(json.dumps(handler_map.get(type).post(args)))

