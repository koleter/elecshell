# 导入 http.server 模块
import http.server
import os
import socketserver
import threading
import uuid

from util.net import get_local_host_ip
from util.port import get_unused_port

_local_server = None


def start_local_server():
    global _local_server
    if _local_server:
        return _local_server
    token = str(uuid.uuid1())
    httpd, local_ip, port = _start_local_server(token)
    _local_server = {
        'httpd': httpd,
        'local_ip': local_ip,
        'port': port,
        'token': token
    }
    return _local_server


def _start_local_server(token):
    port = get_unused_port()
    local_ip = get_local_host_ip()

    # 定义处理 HTTP 请求的处理程序
    class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
        # 设置根目录，默认为当前目录
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)

        def do_GET(self):
            ip = self.client_address
            print(f"远程IP地址是：{ip}")
            # super().do_GET()
            # 获取请求的路径
            path = self.path

            # 分离路径和查询字符串
            query_start = path.find('?')
            if query_start != -1:
                query_string = path[query_start + 1:]
                file_path = path[:query_start]
            else:
                self.send_error(404, "File Not Found")
                return

            # 解析查询字符串
            query_params = {}
            for param in query_string.split('&'):
                key_value = param.split('=')
                if len(key_value) == 2:
                    key, value = key_value
                    query_params[key] = value

            # 输出查询参数
            print("Query parameters:", query_params)
            if query_params.get("token") != token:
                self.send_error(404, "File Not Found")
                return

            # 检查路径是否指向一个有效的文件
            if os.path.isfile(file_path):
                # 设置响应头
                self.send_response(200)
                self.send_header('Content-type', 'text/html')
                self.end_headers()

                # 打开文件并读取内容
                with open(file_path, 'rb') as file:
                    self.wfile.write(file.read())
            else:
                # 如果文件不存在，则返回404错误
                self.send_error(404, "File Not Found")

    class ThreadedHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
        pass
    # 创建一个简单的多线程 HTTP 服务器
    httpd = ThreadedHTTPServer(('0.0.0.0', port), MyHTTPRequestHandler)
    threading.Thread(target=httpd.serve_forever).start()
    return httpd, local_ip, port
