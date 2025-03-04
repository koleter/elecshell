import faulthandler

import tornado.web
from handler.BaseHandler import BaseHandler


class DumpHandler(BaseHandler, tornado.web.RequestHandler):
    def initialize(self, loop):
        super(DumpHandler, self).initialize(loop)

    def get(self):
        faulthandler.dump_traceback()
