import json
import os

import tornado.web

from handler.MixinHandler import MixinHandler
from handler.ConfigHandler import conf_dir_path, namespace_config


class NameSpaceHandler(MixinHandler, tornado.web.RequestHandler):
    def initialize(self, loop):
        super(NameSpaceHandler, self).initialize(loop)

    def get(self):
        entries = os.listdir(conf_dir_path)
        # 过滤出目录
        directories = [{"value": entry, "label": entry} for entry in entries if os.path.isdir(os.path.join(conf_dir_path, entry))]
        self.write(json.dumps(directories))
