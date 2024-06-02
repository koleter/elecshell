import asyncio
import base64
import json
import logging
import os
import stat
import traceback
import types
import uuid

import paramiko
import threading
from tornado.options import options

from handler.pojo.SessionContext import SessionContext
from utils import reset_font, gen_id

from filetransfer.sftp_transfer import sftp_file_transfer

try:
    import secrets
except ImportError:
    secrets = None
import tornado.websocket

from tornado.ioloop import IOLoop
from tornado.iostream import _ERRNO_CONNRESET
from tornado.util import errno_from_exception
from handler.const import BUF_SIZE, callback_map, callback_map_lock

import time
import psutil
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

workers = {}  # {id: worker}
workers_lock = threading.Lock()


class WatchDogFileHandler(FileSystemEventHandler):

    def on_created(self, event):
        if event.is_directory:
            return
        file_name = os.path.basename(event.src_path)
        if not 'elecshellTransfer_' in file_name:
            return
        logging.info(f'File {event.src_path} has been created')
        data = None
        try:
            with open(event.src_path, 'r') as f:
                data = json.loads(f.read())
        except Exception as e:
            logging.error(f"open {event.src_path} error, {str(e)}")
        os.remove(event.src_path)
        if data is None:
            logging.error("data is None")
            return
        worker = workers.get(data.get('sessionId'))



def get_all_drive_letters():
    partitions = psutil.disk_partitions()
    drive_letters = [partition.device for partition in partitions]
    return drive_letters


event_handler = WatchDogFileHandler()

drive_letters = get_all_drive_letters()
print("Monitoring the following drives:", drive_letters)

for drive in drive_letters:
    observer = Observer()
    observer.schedule(event_handler, drive, recursive=True)
    observer.start()


def clear_worker(worker):
    with workers_lock:
        assert worker.id in workers
        workers.pop(worker.id)


def recycle_worker(worker):
    if worker.handler:
        return
    logging.warning('Recycling worker {}'.format(worker.id))
    worker.close(reason='worker recycled')


class Worker(object):
    def __init__(self, id, loop, ssh, chan: paramiko.Channel, dst_addr, login_script=[], debug=False):
        self.loop = loop
        self.ssh = ssh
        self.chan = chan
        self.dst_addr = dst_addr
        self.fd = chan.fileno()
        if not id:
            id = gen_id()
        self.id = id
        self.data_to_dst = []
        self.handler = None
        self.mode = IOLoop.READ
        self.closed = False
        # self.lock = threading.Lock()
        self.debug = debug
        self.xsh_conf_id = None
        self.login_script = login_script
        self.file_transfer = None

    def init_file_transfer(self):
        if self.file_transfer is not None:
            return
        try:
            self.file_transfer = sftp_file_transfer(self)
            return
        except Exception as e:
            logging.error(f"Failed to initialize file transfer: {str(e)}")

    def upload_files(self, files, remote_path):
        self.init_file_transfer()
        self.file_transfer.upload_files(files, remote_path)


    def download_files(self, local_path, remote_path):
        self.init_file_transfer()
        self.file_transfer.download_files(local_path, remote_path)


    def get_remote_file_list(self, msg):
        self.init_file_transfer()
        args = msg.get('args')
        # 获取远程路径下的文件和文件夹属性列表
        ret = self.file_transfer.get_remote_file_list(*args)
        self.handler.write_message({
            'requestId': msg.get("requestId"),
            'val': ret,
            'type': 'response'
        }, binary=False)


    def __call__(self, fd, events):
        if events & IOLoop.READ:
            self._on_read()
        if events & IOLoop.WRITE:
            logging.info("{} IOLoop.WRITE".format(self.id))
            self._on_write()
        if events & IOLoop.ERROR:
            logging.info("{} IOLoop.ERROR".format(self.id))
            self.close(reason='error event occurred')

    def set_handler(self, handler):
        if not self.handler:
            logging.info("{} set handler".format(self.id))
            self.handler = handler

    def update_handler(self, mode):
        if self.mode != mode:
            self.loop.update_handler(self.fd, mode)
            self.mode = mode
        if mode == IOLoop.WRITE:
            self.loop.call_later(0.1, self, self.fd, IOLoop.WRITE)

    def _on_read(self):
        logging.debug('worker {} on read'.format(self.id))
        try:
            data = self.chan.recv(BUF_SIZE)
        except (OSError, IOError) as e:
            traceback.print_exc()
            logging.error(str(e))
            if self.chan.closed or errno_from_exception(e) in _ERRNO_CONNRESET:
                self.close(reason='chan error on reading')
        else:
            if not data:
                self.close(reason='chan closed')
                return

            try:
                res = {
                    'val': base64.b64encode(data).decode(self.encoding),
                    'type': 'data'
                }
                if not self.handler:
                    logging.error("{}'s handler is None".format(self.id))
                self.handler.write_message(res, binary=False)
                if self.login_script is not None and len(self.login_script) != 0 and bytes(self.login_script[0]['expect'], self.encoding) in data:
                    self.send(self.login_script[0]['command'] + "\r")
                    self.login_script = self.login_script[1:]

            except tornado.websocket.WebSocketClosedError:
                self.close(reason='websocket closed')

    def recv(self, data, callback, extra_args=[], sleep=0):
        logging.info('worker {} on read'.format(self.id))

        self.data_to_dst.append(data)
        self._on_write()
        if sleep > 0:
            time.sleep(sleep)
        while not self.chan.recv_ready():
            time.sleep(0.1)

        data = b""
        try:
            data += self.chan.recv(BUF_SIZE)
        except (OSError, IOError) as e:
            traceback.print_exc()
            if self.chan.closed or errno_from_exception(e) in _ERRNO_CONNRESET:
                self.close(reason='chan error on reading')
                return

        if not data:
            self.close(reason='chan closed')
            return

        val = str(data, 'utf-8')
        try:
            res = {
                'val': val,
                'type': 'data'
            }
            self.set_callback_message(callback, res, extra_args)
            self.handler.write_message(res, binary=False)
        except tornado.websocket.WebSocketClosedError:
            self.close(reason='websocket closed')

    def send(self, data, update_handler=True):
        self.data_to_dst.append(data)
        self._on_write(update_handler)

    def _on_write(self, update_handler=True):
        logging.debug('worker {} on write'.format(self.id))
        if not self.data_to_dst:
            return

        data = ''.join(self.data_to_dst)
        logging.debug('{!r} to {}:{}'.format(data, *self.dst_addr))

        try:
            sent = self.chan.send(data)
        except (OSError, IOError) as e:
            logging.error(e)
            if self.chan.closed or errno_from_exception(e) in _ERRNO_CONNRESET:
                self.close(reason='chan error on writing')
            else:
                self.update_handler(IOLoop.WRITE)
        else:
            self.data_to_dst = []
            data = data[sent:]
            if data:
                self.data_to_dst.append(data)
                self.update_handler(IOLoop.WRITE)
            elif update_handler:
                self.update_handler(IOLoop.READ)

    def prompt(self, msg, callback, args):
        '''
        Pop-up window to get user input
        msg: prompt information
        args: The extra parameters of callback
        callback: a callback function, the result of user input will be a parameter of callback, it has two args, callback(worker, args)
        '''
        message = {
            'args': msg,
            'type': 'execMethod',
            'method': 'prompt'
        }
        if callback:
            self.set_callback_message(callback, message, args)
        self.handler.write_message(message)

    def set_callback_message(self, callback, message, args):
        if type(callback) != types.FunctionType:
            raise Exception("callback must be a function")
        req_id = str(uuid.uuid1())
        message['requestId'] = req_id
        with callback_map_lock:
            callback_map[req_id] = (callback, args)

        def delete_callback():
            with callback_map_lock:
                callback_map.pop(req_id, None)

        threading.Timer(30, delete_callback).start()

    def create_new_session(self, conf_list, callback, args):
        '''
        create new session
        conf_path_list: A list, indicating the path of the session configuration file, self.xsh_conf_id means duplicate current session
        callback: Callback function, the parameter is the SessionContext instance object corresponding to the newly created session list
        '''
        if not conf_list:
            logging.error("conf_path_list is None, do nothing")
            return

        message = {
            'args': conf_list,
            'type': 'execMethod',
            'method': 'createNewSession'
        }
        if callback:
            self.set_callback_message(self._init_callback_worker_list(callback), message, args)
        self.handler.write_message(message)

    def _init_callback_worker(self, callback):
        def warp(ctx, args):
            callback(ctx, args)

        return warp

    def _init_callback_worker_list(self, callback):
        def warp(ctx, session_infos, *args):
            context_list = []
            for session_info in session_infos:
                with workers_lock:
                    worker = workers[session_info['id']]
                context_list.append(SessionContext(worker))
            callback(ctx, context_list, *args)

        return warp

    def close(self, reason=None):
        if self.closed:
            return
        self.closed = True

        if self.file_transfer is not None:
            self.file_transfer.close()

        logging.info(
            'Closing worker {} with reason: {}'.format(self.id, reason)
        )
        if self.handler:
            self.loop.remove_handler(self.fd)
            self.handler.close(reason=reason)
        self.chan.close()
        self.ssh.close()
        logging.info('Connection to {}:{} lost'.format(*self.dst_addr))
