import tornado.web

from handler.BaseHandler import BaseHandler


class PingHandler(BaseHandler, tornado.web.RequestHandler):
    def initialize(self, loop):
        super(PingHandler, self).initialize(loop)

    def get(self):
        self.write('pong')
