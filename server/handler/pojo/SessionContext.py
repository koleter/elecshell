import re
from typing import Callable


class SessionContext:
    def __init__(self, worker):
        self._worker = worker

    def recv(self, data, callback, sleep=0, *extra_args):
        '''
        send data and receive result
        data: The command which will be execute
        sleep: The waiting time from sending the command to reading the result, in seconds
        '''
        self._worker.recv(data, callback, extra_args, sleep)

    def recv_util(self, data, expect_list: bytes, callback, *extra_args):
        '''
        send data and receive result
        data: The command which will be execute
        expect_list: Expected byte string to be received
        '''
        self._worker.recv_util(data, expect_list, callback, extra_args)

    def recv_regexp(self, data, pattern: re.Pattern[bytes], callback=None, *extra_args):
        '''
       data: The command which will be execute
       pattern: regexp to match result
       '''
        self._worker.recv_util_match_exp(data, pattern, callback, extra_args)

    # def recv_func(self, data, f: Callable[[list[bytes]], bool], callback=None, *extra_args):
    #     '''
    #    data: The command which will be execute
    #    f: function to check result
    #    '''
    #     self._worker.recv_func(data, f, callback, extra_args)


    def prompt(self, msg, callback, *args):
        '''
        Pop-up window to get user input
        msg: prompt information
        callback: a callback function, it has at least two parameters, callback(ctx, user_input, *args)
        args: The extra User-Defined parameters of callback
        '''
        return self._worker.prompt(msg, callback, args)

    def create_new_session(self, conf_list=None, callback=None, *args):
        '''
        create new session
        conf_list: A list, Elements can be strings or objects, The element can be a string or an object.
                If it is a string type, it should be sessionId. If it is an object, the object should have two attributes: conf_id and session_name,
                 which respectively correspond to the configuration file of the created session and the created session name.
        callback: Callback function, the parameter is the SessionContext instance object corresponding to the newly created session list
        args: The User-Defined parameters of callback
        '''
        return self._worker.create_new_session(conf_list, callback, args)

    def sendln(self, data):
        if data[-1] != '\r':
            data += '\r'
        self.send(data)

    def send(self, data):
        self._worker.send(data)

    def get_xsh_conf_id(self):
        return self._worker.xsh_conf_id
