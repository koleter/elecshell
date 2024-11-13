import tornado.web

from handler.MixinHandler import MixinHandler


class PingHandler(MixinHandler, tornado.web.RequestHandler):
    def initialize(self, loop):
        super(PingHandler, self).initialize(loop)

    def get(self):
        self.write('pong')
