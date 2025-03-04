import tornado.web
from handler.BaseHandler import BaseHandler


class NotFoundHandler(BaseHandler, tornado.web.ErrorHandler):

    def initialize(self):
        super(NotFoundHandler, self).initialize()

    def prepare(self):
        raise tornado.web.HTTPError(404)
