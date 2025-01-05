import faulthandler

import tornado.web
from handler.MixinHandler import MixinHandler


class DumpHandler(MixinHandler, tornado.web.RequestHandler):
    def initialize(self, loop):
        super(DumpHandler, self).initialize(loop)

    def get(self):
        faulthandler.dump_traceback()
