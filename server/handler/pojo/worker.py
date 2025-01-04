import asyncio
import base64
import json
import logging
import os
import platform
import re
import threading
import traceback
import types
import uuid
from asyncio import Queue
from typing import Callable

import paramiko
from filetransfer.py_server_transfer import py_server_sftp_file_transfer
from filetransfer.sftp_transfer import sftp_file_transfer
from handler.pojo.SessionContext import SessionContext
from utils import gen_id

from util.kmp import compute_prefix_function

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

loop = IOLoop.current()


class WatchDogFileHandler(FileSystemEventHandler):

    def on_created(self, event):
        if event.is_directory:
            return
        if 'chrome_drag' in event.src_path:
            return
        file_name = os.path.basename(event.src_path)
        if not 'elecshellTransfer_' in file_name:
            return
        data = None
        # 文件可能还在被创建过程中，操作系统可能还没有完全关闭文件句柄，导致暂时无法访问
        for i in range(5):
            time.sleep(0.1)
            try:
                with open(event.src_path, 'r') as f:
                    data = json.loads(f.read())
                    break
            except Exception as e:
                logging.error(f"open {event.src_path} error, {str(e)}")
        os.remove(event.src_path)
        if data is None:
            return
        worker = workers.get(data.get('sessionId'))
        loop.add_callback(worker.download_files, os.path.dirname(event.src_path), data.get('files'),
                          data.get('remoteDir'))


def get_all_window_drive_letters():
    partitions = psutil.disk_partitions()
    drive_letters = [partition.device for partition in partitions]
    return drive_letters


def start_watcher():
    event_handler = WatchDogFileHandler()

    if platform.system() == 'Windows':
        drive_letters = get_all_window_drive_letters()
    else:
        drive_letters = ["/"]
    print("Monitoring the following drives:", drive_letters)

    for drive in drive_letters:
        observer = Observer()
        observer.schedule(event_handler, drive, recursive=True)
        observer.start()


start_watcher()


def clear_worker(worker):
    with workers_lock:
        assert worker.id in workers
        workers.pop(worker.id)


async def recycle_worker(worker):
    if worker.handler:
        return
    logging.warning('Recycling worker {}'.format(worker.id))
    await worker.close(reason='worker recycled')


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
        self.data_to_dst = ''
        self.handler = None
        self.mode = IOLoop.READ
        self.closed = False
        self.recv_lock = threading.Lock()
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
            logging.warning(f"Failed to initialize sftp file transfer: {str(e)}")

        try:
            self.file_transfer = py_server_sftp_file_transfer(self)
            return
        except Exception as e:
            logging.warning(f"Failed to initialize py server file transfer: {str(e)}")

    def upload_files(self, files, remote_dir):
        self.init_file_transfer()
        self.file_transfer.upload_files(files, remote_dir)

    def download_files(self, local_root_dir, files, remote_path):
        self.init_file_transfer()
        self.file_transfer.download_files(local_root_dir, files, remote_path)

    def get_remote_file_list(self, remote_dir):
        self.init_file_transfer()
        # 获取远程路径下的文件和文件夹属性列表
        self.file_transfer.get_remote_file_list(remote_dir)

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
        self.loop.update_handler(self.fd, mode)

    def _on_read(self):
        logging.debug('worker {} on read'.format(self.id))
        try:
            self.recv_lock.acquire()
            try:
                if not self.chan.recv_ready():
                    return
                data = self.chan.recv(BUF_SIZE)
            finally:
                self.recv_lock.release()
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
                if self.login_script is not None and len(self.login_script) != 0 and bytes(
                    self.login_script[0]['expect'], self.encoding) in data:
                    self.send(self.login_script[0]['command'] + "\r")
                    self.login_script = self.login_script[1:]

            except tornado.websocket.WebSocketClosedError:
                self.close(reason='websocket closed')

    def execute_implicit_command(self, cmd, callback=None, func: Callable[[list[bytes]], bool]=None, extra_args=[], sleep=0, pattern: re.Pattern[bytes] = None):
        if pattern:
            return self.recv_util_match_exp(f'({cmd}; builtin history -d $((HISTCMD-1)))', pattern, callback,
                                            extra_args,
                                            show_on_term=False)
        elif func:
            return self.recv_func(f'({cmd}; builtin history -d $((HISTCMD-1)))', func, callback, extra_args, False)
        else:
            return self.recv(f'({cmd}; builtin history -d $((HISTCMD-1)))', callback, extra_args, sleep,
                             show_on_term=False)

    def recv_util_match_exp(self, data, pattern: re.Pattern[bytes], callback=None, extra_args=[], show_on_term=True):
        # logging.info('worker {} on read'.format(self.id))
        if not (data.endswith('\r') or data.endswith('\n')):
            data += "\r"
        # self.update_handler(IOLoop.WRITE)
        self.data_to_dst += data

        self.recv_lock.acquire()
        try:
            self._on_write()

            data = b""
            while True:
                try:
                    while not self.chan.recv_ready():
                        # await asyncio.sleep(0.1)
                        time.sleep(0.1)
                    data += self.chan.recv(BUF_SIZE)
                except (OSError, IOError) as e:
                    traceback.print_exc()
                    if self.chan.closed or errno_from_exception(e) in _ERRNO_CONNRESET:
                        self.close(reason='chan error on reading')
                        return
                matches = pattern.search(data)
                if matches:
                    break
        finally:
            self.recv_lock.release()

        if not data:
            self.close(reason='chan closed')
            return
        try:
            if not callback and not show_on_term:
                return matches
            res = {
                'val': base64.b64encode(data).decode(self.encoding),
                'type': 'data',
                "showOnTerm": show_on_term
            }
            if callback:
                self.set_callback_message(callback, res, extra_args)
            self.handler.write_message(res, binary=False)
            # self.update_handler(IOLoop.READ)
            return matches
        except tornado.websocket.WebSocketClosedError:
            self.close(reason='websocket closed')

    def recv_func(self, cmd, f: Callable[[list[bytes]], bool], callback=None, extra_args=[], show_on_term=True):
        # logging.info('worker {} on read'.format(self.id))
        if not (cmd.endswith('\r') or cmd.endswith('\n')):
            cmd += "\r"
        # self.update_handler(IOLoop.WRITE)
        self.data_to_dst += cmd
        self.recv_lock.acquire()
        try:
            self._on_write()
            data = b""

            while not f(data):
                try:
                    while not self.chan.recv_ready():
                        time.sleep(0.1)
                    data += self.chan.recv(BUF_SIZE)
                except (OSError, IOError) as e:
                    traceback.print_exc()
                    if self.chan.closed or errno_from_exception(e) in _ERRNO_CONNRESET:
                        self.close(reason='chan error on reading')
                        return
        finally:
            self.recv_lock.release()

        if not data:
            self.close(reason='chan closed')
            return
        try:
            if not callback and not show_on_term:
                return data
            res = {
                'val': base64.b64encode(data).decode(self.encoding),
                'type': 'data',
                "showOnTerm": show_on_term
            }
            if callback:
                self.set_callback_message(callback, res, extra_args)
            self.handler.write_message(res, binary=False)
            # self.update_handler(IOLoop.READ)
            return data
        except tornado.websocket.WebSocketClosedError:
            self.close(reason='websocket closed')

    def recv_util(self, cmd, expect_list: list[bytes], callback=None, extra_args=[], show_on_term=True):
        if not isinstance(expect_list, list):
            raise Exception('expect_list should be a list')
        # logging.info('worker {} on read'.format(self.id))
        if not (cmd.endswith('\r') or cmd.endswith('\n')):
            cmd += "\r"
        # self.update_handler(IOLoop.WRITE)
        self.data_to_dst += cmd
        self.recv_lock.acquire()
        try:
            self._on_write()
            data = b""
            text = b""

            for pattern in expect_list:
                m = len(pattern)
                j = 0
                table = compute_prefix_function(pattern)

                while True:
                    continue_outer = False
                    while len(text) > 0:
                        if j > 0 and text[0] != pattern[j]:
                            j = table[j - 1]
                            text = text[1:]
                            continue
                        if text[0] == pattern[j]:
                            j += 1
                        if j == m:
                            continue_outer = True
                            break
                        text = text[1:]
                    if continue_outer:
                        break

                    try:
                        while not self.chan.recv_ready():
                            time.sleep(0.1)
                        text = self.chan.recv(BUF_SIZE)
                        data += text
                    except (OSError, IOError) as e:
                        traceback.print_exc()
                        if self.chan.closed or errno_from_exception(e) in _ERRNO_CONNRESET:
                            self.close(reason='chan error on reading')
                            return
        finally:
            self.recv_lock.release()

        if not data:
            self.close(reason='chan closed')
            return
        try:
            if not callback and not show_on_term:
                return data
            res = {
                'val': base64.b64encode(data).decode(self.encoding),
                'type': 'data',
                "showOnTerm": show_on_term
            }
            if callback:
                self.set_callback_message(callback, res, extra_args)
            self.handler.write_message(res, binary=False)
            # self.update_handler(IOLoop.READ)
            return data
        except tornado.websocket.WebSocketClosedError:
            self.close(reason='websocket closed')

    def recv(self, data, callback=None, extra_args=[], sleep=0, show_on_term=True):
        # logging.info('worker {} on read'.format(self.id))
        if not (data.endswith('\r') or data.endswith('\n')):
            data += "\r"
        # self.update_handler(IOLoop.WRITE)
        self.data_to_dst += data
        self.recv_lock.acquire()
        try:
            self._on_write()
            if sleep > 0:
                # await asyncio.sleep(sleep)
                time.sleep(sleep)
            while not self.chan.recv_ready():
                time.sleep(0.1)
                # 使用 await asyncio.sleep(1) 会莫名其妙卡死
                # await asyncio.sleep(0.1)

            data = b""
            try:
                data += self.chan.recv(BUF_SIZE)
            except (OSError, IOError) as e:
                traceback.print_exc()
                if self.chan.closed or errno_from_exception(e) in _ERRNO_CONNRESET:
                    self.close(reason='chan error on reading')
                    return
        finally:
            self.recv_lock.release()

        if not data:
            self.close(reason='chan closed')
            return
        try:
            if not callback and not show_on_term:
                return data
            res = {
                'val': base64.b64encode(data).decode(self.encoding),
                'type': 'data',
                "showOnTerm": show_on_term
            }
            if callback:
                self.set_callback_message(callback, res, extra_args)
            self.handler.write_message(res, binary=False)
            # self.update_handler(IOLoop.READ)
            return data
        except tornado.websocket.WebSocketClosedError:
            self.close(reason='websocket closed')

    def send(self, data):
        self.data_to_dst += data
        self._on_write()

    def _on_write(self):
        if not self.data_to_dst:
            return

        try:
            sent = self.chan.send(self.data_to_dst)
        except (OSError, IOError) as e:
            logging.error(e)
            if self.chan.closed or errno_from_exception(e) in _ERRNO_CONNRESET:
                self.close(reason='chan error on writing')
            else:
                self._on_write()
        else:
            self.data_to_dst = self.data_to_dst[sent:]
            if self.data_to_dst:
                self._on_write()
            # else:
            #     self.update_handler(IOLoop.READ)

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

    async def close(self, reason=None):
        if self.closed:
            return
        self.closed = True

        logging.info(f"worker ${self.id} is closing")

        if self.file_transfer is not None:
            self.file_transfer.close()
        await self.file_transfer_queue.put(None)

        logging.info(
            'Closing worker {} with reason: {}'.format(self.id, reason)
        )
        if self.handler:
            self.loop.remove_handler(self.fd)
            self.handler.close(reason=reason)
        self.chan.close()
        self.ssh.close()
        logging.info('Connection to {}:{} lost'.format(*self.dst_addr))
