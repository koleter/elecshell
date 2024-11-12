import os
import threading
import time

import tornado.web

from handler.MixinHandler import MixinHandler

clock = time.time()
ttl = 30


def check_should_exit():
    while True:
        time.sleep(ttl)
        if time.time() - clock > ttl:
            os._exit(1)


threading.Thread(target=check_should_exit).start()


class PingHandler(MixinHandler, tornado.web.RequestHandler):
    def initialize(self, loop):
        super(PingHandler, self).initialize(loop)

    def get(self):
        global clock
        clock = time.time()
        self.write('pong')
