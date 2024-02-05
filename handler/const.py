import threading

DEFAULT_PORT = 22
swallow_http_errors = True
redirecting = None
BUF_SIZE = 32 * 1024
TERM = 'vt100'
OPERATION_SUCCESS = 'opration success'
# key is a uuid, the value is a tuple,  the first is callback, the second is args of callback
callback_map = {}
callback_map_lock = threading.Lock()
