import json
import logging
import os.path
import socket
import traceback
import paramiko
import tornado.web

from concurrent.futures import ThreadPoolExecutor
from tornado.options import options
from tornado.process import cpu_count

from exception.InvalidValueError import InvalidValueError
from handler.ConfigHandler import xsh_dir_path
from handler.MixinHandler import MixinHandler
from handler.pojo.PrivateKey import PrivateKey
from handler.pojo.SSHClient import SSHClient
from handler.const import swallow_http_errors, DEFAULT_PORT, TERM
from util.str_variable_util import getRealstr
from utils import (
    is_valid_ip_address, is_valid_port, is_valid_hostname, to_str,
    to_int, is_valid_encoding
)
from handler.pojo.worker import Worker, workers, workers_lock

try:
    from json.decoder import JSONDecodeError
except ImportError:
    JSONDecodeError = ValueError



class IndexHandler(MixinHandler, tornado.web.RequestHandler):


    def initialize(self, loop, policy, host_keys_settings):
        super(IndexHandler, self).initialize(loop)
        self.policy = policy
        self.host_keys_settings = host_keys_settings
        self.ssh_client = self.get_ssh_client()
        self.debug = self.settings.get('debug', False)
        self.font = self.settings.get('font', '')
        self.result = dict(id=None, status=None, encoding=None, sessionName=None, filePath=None)
        self.executor = ThreadPoolExecutor(max_workers=cpu_count()*5)

    def write_error(self, status_code, **kwargs):
        if swallow_http_errors and self.request.method == 'POST':
            exc_info = kwargs.get('exc_info')
            if exc_info:
                reason = getattr(exc_info[1], 'log_message', None)
                if reason:
                    self._reason = reason
            self.result.update(status=self._reason)
            self.set_status(200)
            self.finish(self.result)
        else:
            super(IndexHandler, self).write_error(status_code, **kwargs)

    def get_ssh_client(self):
        ssh = SSHClient()
        ssh._system_host_keys = self.host_keys_settings['system_host_keys']
        ssh._host_keys = self.host_keys_settings['host_keys']
        ssh._host_keys_filename = self.host_keys_settings['host_keys_filename']
        ssh.set_missing_host_key_policy(self.policy)
        return ssh

    def get_privatekey(self):
        name = 'privatekey'
        filename = self.get_argument(name)
        with open(filename, 'r') as f:
            return f.read(), filename

    def get_hostname(self):
        value = self.get_value('hostname')
        if not (is_valid_hostname(value) or is_valid_ip_address(value)):
            raise InvalidValueError('Invalid hostname: {}'.format(value))
        return value

    def get_port(self):
        value = self.get_argument('port', u'')
        if not value:
            return DEFAULT_PORT

        port = to_int(value)
        if port is None or not is_valid_port(port):
            raise InvalidValueError('Invalid port: {}'.format(value))
        return port

    def lookup_hostname(self, hostname, port):
        key = hostname if port == 22 else '[{}]:{}'.format(hostname, port)

        if self.ssh_client._system_host_keys.lookup(key) is None:
            if self.ssh_client._host_keys.lookup(key) is None:
                raise tornado.web.HTTPError(
                        403, 'Connection to {}:{} is not allowed.'.format(
                            hostname, port)
                    )

    def parse_encoding(self, data):
        try:
            encoding = to_str(data.strip(), 'ascii')
        except UnicodeDecodeError:
            return

        if is_valid_encoding(encoding):
            return encoding

    def get_default_encoding(self, ssh):
        commands = [
            '$SHELL -ilc "locale charmap"',
            '$SHELL -ic "locale charmap"'
        ]

        for command in commands:
            try:
                _, stdout, _ = ssh.exec_command(command,
                                                get_pty=True,
                                                timeout=1)
            except paramiko.SSHException as exc:
                logging.info(str(exc))
            else:
                try:
                    data = stdout.read()
                except socket.timeout:
                    pass
                else:
                    logging.debug('{!r} => {!r}'.format(command, data))
                    result = self.parse_encoding(data)
                    if result:
                        return result

        logging.warning('Could not detect the default encoding.')
        return 'utf-8'

    def ssh_connect(self, id, ssh_args, login_script):
        ssh = self.ssh_client
        dst_addr = ssh_args[:2]
        logging.info('Connecting to {}:{}'.format(*dst_addr))

        try:
            ssh.connect(*ssh_args, timeout=options.timeout)
        except socket.error:
            raise ValueError('Unable to connect to {}:{}'.format(*dst_addr))
        except paramiko.BadAuthenticationType:
            raise ValueError('Bad authentication type.')
        except paramiko.AuthenticationException:
            raise ValueError('Authentication failed.')
        except paramiko.BadHostKeyException:
            raise ValueError('Bad host key.')

        # 创建 SFTP 客户端
        sftp = ssh.open_sftp()
        chan = ssh.invoke_shell(term=TERM)
        chan.setblocking(0)
        # chan.settimeout(1)
        worker = Worker(id, self.loop, ssh, chan, dst_addr, login_script, self.debug)
        worker.fileTransfer = sftp
        worker.encoding = options.encoding if options.encoding else \
            self.get_default_encoding(ssh)
        return worker


    def head(self):
        pass

    def get(self):
        self.render('index.html', debug=self.debug, font=self.font)

    @tornado.gen.coroutine
    def post(self):
        if workers and len(workers) >= options.maxconn:
            raise tornado.web.HTTPError(403, 'Too many live connections.')

        try:
            data = json.loads(self.request.body)
            session_conf_file_path = os.path.join(xsh_dir_path, data['filePath'])
            session_name = data.get('sessionName')
            with open(session_conf_file_path, 'r') as f:
                session_conf = json.loads(f.read())
                hostname = getRealstr(session_conf.get('hostname'))
                port = session_conf.get('port')
                username = getRealstr(session_conf.get('username'))
                password = getRealstr(session_conf.get('password'))
                filename = session_conf.get('privatekey')
                privatekey = ''
                if filename and filename.strip() != '':
                    try:
                        with open(filename, 'r') as f:
                            privatekey = f.read()
                    except FileNotFoundError as e:
                        raise tornado.web.HTTPError(400, 'No such privatekey file: {}'.format(filename))
                passphrase = getRealstr(session_conf.get('passphrase'))
                totp = getRealstr(session_conf.get('totp'))

            if isinstance(self.policy, paramiko.RejectPolicy):
                self.lookup_hostname(hostname, port)

            if privatekey:
                pkey = PrivateKey(privatekey, passphrase, filename).get_pkey_obj()
            else:
                pkey = None

            self.ssh_client.totp = totp
        except InvalidValueError as exc:
            raise tornado.web.HTTPError(400, str(exc))

        future = self.executor.submit(self.ssh_connect, data.get("id"), (hostname, port, username, password, pkey), session_conf.get('login_script'))

        try:
            worker = yield future
        except (ValueError, paramiko.SSHException) as exc:
            logging.error(traceback.format_exc())
            self.result.update(status=str(exc))
        else:
            worker.xsh_conf_id = data['sessionConfId']
            with workers_lock:
                workers[worker.id] = worker
            # self.loop.call_later(options.delay, recycle_worker, worker)
            self.result.update(id=worker.id, encoding=worker.encoding)
            self.result.update(sessionName=session_conf['sessionName'])
            if session_name:
                self.result.update(sessionName=session_name)
            self.result.update(filePath=data['filePath'])

        self.write(self.result)
