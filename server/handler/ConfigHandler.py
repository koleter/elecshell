import json
import os

import tornado.web
from handler.MixinHandler import MixinHandler
from handler.pojo.conf.GlobalAutoConfig import GlobalAutoConfig
from handler.pojo.conf.ScriptConfig import ScriptConfig
from handler.pojo.conf.SessionConfig import SessionConfig
from handler.pojo.conf.ConfigableGlobalConfig import ConfigableGlobalConfig

from settings import base_dir

# from tornado.options import options
# base_dir = options.basedir
# if not base_dir:
#     import appdirs
#     base_dir = appdirs.user_config_dir(appname="elecshell", appauthor="")

conf_dir_path = os.path.join(base_dir, 'config')

xsh_dir_path = os.path.join(conf_dir_path, 'xsh')
script_dir_path = os.path.join(conf_dir_path, 'script')
global_dir_path = os.path.join(conf_dir_path, 'global')

configable_global_config = ConfigableGlobalConfig(global_dir_path)

handler_map = {
    'SessionConfig': SessionConfig(xsh_dir_path),
    'ScriptConfig': ScriptConfig(script_dir_path),
    'GlobalAutoConfig': GlobalAutoConfig(global_dir_path),
    'ConfigableGlobalConfig': configable_global_config
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

