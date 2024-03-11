import asyncio
import imp
import json
import logging
import struct
import time
import traceback

import paramiko
import tornado.web
from tornado.ioloop import IOLoop

from exception.InvalidValueError import InvalidValueError
from handler.MixinHandler import MixinHandler
from handler.const import callback_map, callback_map_lock
from handler.pojo.SessionContext import SessionContext
from handler.pojo.worker import workers, clear_worker, workers_lock
from utils import (
    UnicodeType
)

try:
    from json.decoder import JSONDecodeError
except ImportError:
    JSONDecodeError = ValueError


class WsockHandler(MixinHandler, tornado.websocket.WebSocketHandler):

    def initialize(self, loop):
        super(WsockHandler, self).initialize(loop)
        self.worker_ref = None

    async def open(self):
        if not workers:
            self.close(reason='Websocket authentication failed.')
            return

        try:
            worker_id = self.get_value('id')
        except (tornado.web.MissingArgumentError, InvalidValueError) as exc:
            self.close(reason=str(exc))
        else:
            with workers_lock:
                worker = workers.get(worker_id)
            if worker:
                self.set_nodelay(True)
                worker.set_handler(self)
                self.worker_ref = worker
                self.loop.add_handler(worker.fd, worker, IOLoop.READ)
            else:
                self.close(reason='Websocket authentication failed.')

    def on_message(self, message):
        worker = self.worker_ref
        if not worker:
            # The worker has likely been closed. Do not process.
            self.close(reason='No worker found')
            return

        if worker.closed:
            self.close(reason='Worker closed')
            return

        try:
            msg = json.loads(message)
        except JSONDecodeError:
            return

        if not isinstance(msg, dict):
            return

        type = msg.get('type')
        if type == 'resize':
            resize = msg.get('resize')
            if resize and len(resize) == 2:
                try:
                    worker.chan.resize_pty(*resize)
                except (TypeError, struct.error, paramiko.SSHException):
                    pass
        elif type == 'data':
            data = msg.get('data')
            if data and isinstance(data, UnicodeType):
                worker.send(data)
        elif type == 'sendRecv':
            data = msg.get('data')
            requestId = msg.get('requestId')

            recv = worker.on_recv(data)

            worker.handler.write_message({
                'requestId': requestId,
                'val': recv,
                'type': 'response'
            }, binary=False)
        elif type == 'exec':
            path = msg.get('path')

            try:
                module = imp.load_source(path, path)
                module.Main(SessionContext(worker))
                worker.handler.write_message({
                    'type': 'message',
                    'status': 'success',
                    'content': 'execute script success'
                })
            except FileNotFoundError as e:
                worker.handler.write_message({
                    'type': 'message',
                    'status': 'error',
                    "content": 'No such file: {}'.format(path)
                })
            except Exception as e:
                traceback.print_exc()
                worker.handler.write_message({
                    'type': 'message',
                    'status': 'error',
                    "content": str(e)
                })
        elif type == 'callback':
            requestId = msg.get('requestId')
            with callback_map_lock:
                t = callback_map.get(requestId)
            if not t:
                worker.handler.write_message({
                    'type': 'message',
                    'status': 'error',
                    "content": 'server error'
                })
            try:
                t[0](SessionContext(worker), msg.get('args'), *t[1])
            except Exception as e:
                traceback.print_exc()
                pass
            finally:
                with callback_map_lock:
                    callback_map.pop(requestId, None)

    def on_close(self):
        if not self.close_reason:
            logging.info('close_reason is {}'.format(self.close_reason))
        worker = self.worker_ref if self.worker_ref else None
        if worker:
            clear_worker(worker)
            worker.close(reason=self.close_reason)
