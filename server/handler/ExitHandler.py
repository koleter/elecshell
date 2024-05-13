import tornado.web
from handler.MixinHandler import MixinHandler



class ExitHandler(MixinHandler, tornado.web.RequestHandler):
    def initialize(self, loop):
        super(ExitHandler, self).initialize(loop)

    def post(self):
        print("server should exit")
        exit(0)

