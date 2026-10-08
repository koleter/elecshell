import asyncio
import json
import logging
import os
import shutil
import stat
import tempfile
import uuid

import requests
import tornado.ioloop
import tornado.web

from filetransfer.sftp_transfer import sftp_file_transfer
from handler.BaseHandler import BaseHandler
from handler.pojo.worker import workers


CHUNK_SIZE = 64 * 1024
# 每传输该数量字节向进度面板上报一次进度
PROGRESS_REPORT_BYTES = 2 * 1024 * 1024


def _make_tarball(source_dir, tar_path):
    """将目录内容打包为 tar.gz(阻塞, 需在线程池中执行)"""
    import tarfile
    with tarfile.open(tar_path, 'w:gz') as tar:
        for name in os.listdir(source_dir):
            tar.add(os.path.join(source_dir, name), arcname=name)


class DragDownloadHandler(BaseHandler, tornado.web.RequestHandler):
    """
    拖拽下载端点: 用户拖出远程文件放置时, Chromium 向本端点发起 GET,
    服务端流式返回文件内容, 由 Chromium 直接写入放置目标目录。

    尽量复用既有逻辑:
    - 通道选择: worker.init_file_transfer (SFTP 优先, 失败回退远程 py_server)
    - 多文件/目录下载: 各传输类的 download_entry_sync (顶层条目并行)
    - 单个普通文件: 直接流式返回(SFTP channel 读取 / py_server 代理), 不落盘
    """

    def _report_progress(self, worker, progress_id, file_path, sent, total):
        if not worker or not worker.handler or sent <= 0:
            return
        try:
            worker.handler.write_message({
                'type': 'execSessionMethod',
                'method': 'refreshFileProgressInfo',
                'args': {
                    'id': progress_id,
                    'filePath': file_path,
                    'percent': int(sent * 100 / total) if total else 100,
                },
            }, binary=False)
        except Exception as e:
            logging.debug(f'report drag download progress failed: {e}')

    async def _pump(self, worker, read_chunk, progress_id, file_path, total):
        """循环从线程池中读取数据块并写回响应"""
        loop = tornado.ioloop.IOLoop.current()
        sent = 0
        last_report = 0
        while True:
            chunk = await loop.run_in_executor(None, read_chunk)
            if not chunk:
                break
            self.write(chunk)
            await self.flush()
            sent += len(chunk)
            if sent - last_report >= PROGRESS_REPORT_BYTES:
                last_report = sent
                self._report_progress(worker, progress_id, file_path, sent, total)
        self._report_progress(worker, progress_id, file_path, sent, total)

    @staticmethod
    def _make_reader(read_func):
        """包装零参阻塞函数: 每次调用读取一块数据, 读完后返回 b''"""
        state = {'done': False}

        def read_chunk():
            if state['done']:
                return b''
            data = read_func(CHUNK_SIZE)
            if not data:
                state['done'] = True
            return data

        return read_chunk

    def _error(self, worker, status, msg):
        logging.error(msg)
        if worker and worker.handler:
            try:
                worker.handler.write_message({
                    'type': 'message',
                    'status': 'error',
                    'content': msg,
                }, binary=False)
            except Exception:
                pass
        self.set_status(status)
        self.finish(msg)

    async def _get_transfer(self, worker):
        """复用 worker.init_file_transfer 的通道选择(SFTP 优先, 回退 py_server)"""
        loop = tornado.ioloop.IOLoop.current()
        try:
            await loop.run_in_executor(None, worker.init_file_transfer)
        except Exception as e:
            logging.warning(f'init worker file transfer failed: {e}')
        return worker.file_transfer

    async def get(self):
        session_id = self.get_argument('sessionId', '')
        remote_dir = self.get_argument('remoteDir', '')
        try:
            files = json.loads(self.get_argument('files', '[]'))
        except ValueError:
            files = []
        if not session_id or not remote_dir or not files:
            self._error(None, 400, 'invalid drag download request')
            return

        worker = workers.get(session_id)
        if not worker or not worker.ssh:
            self._error(None, 404, f'no active session: {session_id}')
            return

        transfer = await self._get_transfer(worker)
        if transfer is None:
            self._error(worker, 500, 'no available file transfer channel for drag download')
            return

        progress_id = str(uuid.uuid1())
        self.set_header('Content-Type', 'application/octet-stream')

        # 单个条目: 普通文件直接流式返回; 目录则交给 bundle
        if len(files) == 1:
            remote_path = remote_dir + '/' + files[0]
            if isinstance(transfer, sftp_file_transfer):
                handled = await self._stream_remote_file_sftp(
                    worker, remote_path, progress_id)
            else:
                handled = await self._stream_remote_file_py_server(
                    worker, transfer, remote_path, progress_id)
            if handled:
                return

        await self._stream_bundle(worker, transfer, remote_dir, files, progress_id)

    async def _stream_remote_file_sftp(self, worker, remote_path, progress_id):
        """
        SFTP 模式单文件: 开独立 channel 流式返回, 不落盘。
        返回 True 表示请求已完成; 目标是目录时返回 False(由调用方走 bundle)。
        """
        loop = tornado.ioloop.IOLoop.current()

        def _open_and_stat():
            sftp = worker.ssh.open_sftp()
            try:
                return sftp, sftp.stat(remote_path)
            except Exception:
                sftp.close()
                raise

        try:
            sftp, st = await loop.run_in_executor(None, _open_and_stat)
        except Exception as e:
            self._error(worker, 404, f'cannot access remote file {remote_path}: {e}')
            return True
        try:
            if not stat.S_ISREG(st.st_mode):
                return False
            self.set_header('Content-Length', str(st.st_size))
            remote_file = await loop.run_in_executor(
                None, lambda: sftp.open(remote_path, 'rb'))
            try:
                await self._pump(worker, self._make_reader(remote_file.read),
                                 progress_id, remote_path, st.st_size)
            finally:
                await loop.run_in_executor(None, remote_file.close)
        finally:
            await loop.run_in_executor(None, sftp.close)
        self.finish()
        return True

    async def _stream_remote_file_py_server(self, worker, transfer, remote_path, progress_id):
        """
        py_server 模式单文件: 代理远程 HTTP 响应流式转发, 不落盘。
        返回 True 表示请求已完成; 目标是目录时返回 False(由调用方走 bundle)。
        """
        loop = tornado.ioloop.IOLoop.current()
        url = transfer.get_remote_file_url(remote_path)
        try:
            response = await loop.run_in_executor(
                None, lambda: requests.get(url, stream=True, timeout=10))
        except Exception as e:
            self._error(worker, 500, f'connect remote file server failed: {e}')
            return True

        if response.status_code == 202:
            # 目录, 交给 bundle 路径
            response.close()
            return False
        if response.status_code != 200:
            body = response.text
            response.close()
            self._error(worker, 500, f'download {remote_path} failed: {body}')
            return True

        size = None
        try:
            size = await loop.run_in_executor(
                None, lambda: transfer.get_remote_file_size(remote_path))
            self.set_header('Content-Length', str(size))
        except Exception as e:
            logging.debug(f'get remote file size failed: {e}')

        iterator = response.iter_content(CHUNK_SIZE)

        def read_func(_):
            return next(iterator, b'')

        try:
            await self._pump(worker, self._make_reader(read_func),
                             progress_id, remote_path, size or 0)
        finally:
            response.close()
        self.finish()
        return True

    async def _stream_bundle(self, worker, transfer, remote_dir, files, progress_id):
        """目录或多文件: 顶层条目并行下载到临时目录(复用 download_entry_sync),
        打包 tar.gz 后流式返回"""
        loop = tornado.ioloop.IOLoop.current()
        temp_dir = tempfile.mkdtemp(prefix='elecshell_drag_')
        # tar 输出放在独立目录, 避免被自身打包
        tar_dir = tempfile.mkdtemp(prefix='elecshell_drag_bundle_')
        tar_path = os.path.join(tar_dir, 'bundle.tar.gz')
        try:
            try:
                # 每个顶层条目一个线程池任务并行下载
                # (SFTP 模式下 download_entry_sync 自动为每个条目开独立 channel)
                await asyncio.gather(*[
                    loop.run_in_executor(None, transfer.download_entry_sync,
                                         temp_dir, file_name, remote_dir)
                    for file_name in files
                ])
            except Exception as e:
                self._error(worker, 500, f'download remote files failed: {e}')
                return

            def make_tar():
                _make_tarball(temp_dir, tar_path)
                return os.path.getsize(tar_path)

            try:
                size = await loop.run_in_executor(None, make_tar)
            except Exception as e:
                self._error(worker, 500, f'make tarball failed: {e}')
                return

            self.set_header('Content-Length', str(size))
            tar_file = await loop.run_in_executor(
                None, lambda: open(tar_path, 'rb'))
            try:
                await self._pump(worker, self._make_reader(tar_file.read),
                                 progress_id, tar_path, size)
            finally:
                await loop.run_in_executor(None, tar_file.close)
            self.finish()
        finally:
            await loop.run_in_executor(
                None, lambda: (shutil.rmtree(temp_dir, ignore_errors=True),
                               shutil.rmtree(tar_dir, ignore_errors=True)))
