# 导入 http.server 模块
import concurrent
import http.server
import socketserver
import os
import threading
from uuid import uuid4

from util.port import get_unused_port
from util.net import get_local_host_ip


def start_server(root_path):
    port = get_unused_port()
    local_ip = get_local_host_ip()

    # 定义处理 HTTP 请求的处理程序
    class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
        # 设置根目录，默认为当前目录
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=root_path, **kwargs)

        def do_GET(self):
            ip = self.client_address
            print(f"远程IP地址是：{ip}")
            super().do_GET()
            # try:
            #     # 解析请求路径，获取文件绝对路径
            #     absolute_path = os.path.abspath(os.path.join(self.directory, self.path[1:]))
            #
            #     # 检查文件是否存在
            #     if os.path.exists(absolute_path):
            #         # 如果请求的是文件，则返回文件内容
            #         with open(absolute_path, 'rb') as f:
            #             self.send_response(200)
            #             self.send_header('Content-type', 'text/html')
            #             self.end_headers()
            #             self.wfile.write(f.read())
            #     else:
            #         # 如果文件不存在，返回 404 错误
            #         self.send_error(404, 'File Not Found: {}'.format(self.path))
            # except Exception as e:
            #     # 处理异常情况
            #     self.send_error(500, 'Internal Server Error: {}'.format(str(e)))


    # 创建一个简单的 HTTP 服务器
    httpd = socketserver.TCPServer(("0.0.0.0", port), MyHTTPRequestHandler)
    threading.Thread(target=httpd.serve_forever).start()
    return httpd, local_ip, port
