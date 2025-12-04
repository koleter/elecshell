import logging
import os

import tornado.ioloop
import tornado.web
from tornado.options import options

from handler import const
from handler.ConfigHandler import ConfigHandler
from handler.IndexHandler import IndexHandler
from handler.NameSpaceHandler import NameSpaceHandler
from handler.NotFoundHandler import NotFoundHandler
from handler.WsockHandler import WsockHandler
from logging.handlers import RotatingFileHandler

from handler.PingHandler import PingHandler
from handler import DumpHandler
from handler.trace import TraceHandler
from settings import base_dir
from settings import (
    get_app_settings, get_host_keys_settings, get_policy_setting,
    get_server_settings, check_encoding_setting
)
import faulthandler

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# 创建一个handler用于写入日志文件
log_file_dir = os.path.join(base_dir, 'logs')
if not os.path.exists(log_file_dir):
    os.makedirs(log_file_dir)
file_handler = RotatingFileHandler(os.path.join(log_file_dir, "server.log"), maxBytes=5 * 1024 * 1024, backupCount=5)
file_handler.setLevel(logging.DEBUG)  # 设置文件handler的日志级别
file_formatter = logging.Formatter(
    "%(asctime)s - %(threadName)s - %(filename)s:%(lineno)d - %(levelname)s: %(message)s")
file_handler.setFormatter(file_formatter)

# 设置将日志输出到控制台
controlshow = logging.StreamHandler()
controlshow.setLevel(logging.INFO)
# 设置日志的格式
formatter = logging.Formatter("%(asctime)s - %(threadName)s - %(filename)s:%(lineno)d - %(levelname)s: %(message)s")
controlshow.setFormatter(formatter)

logger.addHandler(file_handler)
logger.addHandler(controlshow)

faulthandler.enable()


def make_handlers(loop, options):
    host_keys_settings = get_host_keys_settings(options)
    policy = get_policy_setting(options, host_keys_settings)

    handlers = [
        (r'/session', IndexHandler, dict(loop=loop, policy=policy,
                                         host_keys_settings=host_keys_settings)),
        (r'/ws', WsockHandler, dict(loop=loop)),
        (r'/conf', ConfigHandler, dict(loop=loop)),
        (r'/ping', PingHandler, dict(loop=loop)),
        (r'/namespace', NameSpaceHandler, dict(loop=loop)),
        (r'/dump', DumpHandler, dict(loop=loop)),
        (r'/trace', TraceHandler, dict(loop=loop))
    ]
    return handlers


def make_app(handlers, settings):
    settings.update(default_handler_class=NotFoundHandler)
    return tornado.web.Application(handlers, **settings)


def app_listen(app, port, address, server_settings):
    app.listen(port, address, **server_settings)
    if not server_settings.get('ssl_options'):
        server_type = 'http'
    else:
        server_type = 'https'
        const.redirecting = True if options.redirect else False
    logging.info(
        'Listening on {}:{} ({})'.format(address, port, server_type)
    )


def main():
    options.parse_command_line()
    check_encoding_setting(options.encoding)
    loop = tornado.ioloop.IOLoop.current()
    app = make_app(make_handlers(loop, options), get_app_settings(options))
    server_settings = get_server_settings(options)
    app_listen(app, options.port, options.address, server_settings)

    # url = "http://localhost:{}/session".format(options.port)
    # webbrowser.open(url, new=0, autoraise=True)
    # asyncio.run(start_watcher())
    # loop.add_callback(start_watcher)
    loop.start()


if __name__ == '__main__':
    main()
