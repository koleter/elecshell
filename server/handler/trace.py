import tracemalloc

import tornado.web
from handler.BaseHandler import BaseHandler


class TraceHandler(BaseHandler, tornado.web.RequestHandler):

    snapshot = None

    def initialize(self, loop):
        super(TraceHandler, self).initialize(loop)
        tracemalloc.start()
        self.snapshot = tracemalloc.take_snapshot()

    def get(self):
        new_snapshot = tracemalloc.take_snapshot()
        stats = new_snapshot.compare_to(self.snapshot, 'traceback')
        ret = ''
        for stat in stats[:50]:
            ret += str(stat) + "\n"
        self.write(ret)
        self.snapshot = new_snapshot


