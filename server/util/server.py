# 导入 http.server 模块
import concurrent
import http.server
import socketserver
import os
from uuid import uuid4

from util.port import get_unused_port


def start_server(root_path):
    port = get_unused_port()
    token = uuid4().hex

    # 定义处理 HTTP 请求的处理程序
    class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
        # 设置根目录，默认为当前目录
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=root_path, **kwargs)

        def do_GET(self):
            try:
                # 解析请求路径，获取文件绝对路径
                absolute_path = os.path.abspath(os.path.join(self.directory, self.path[1:]))

                # 检查文件是否存在
                if os.path.exists(absolute_path):
                    # 如果请求的是文件，则返回文件内容
                    with open(absolute_path, 'rb') as f:
                        self.send_response(200)
                        self.send_header('Content-type', 'text/html')
                        self.end_headers()
                        self.wfile.write(f.read())
                else:
                    # 如果文件不存在，返回 404 错误
                    self.send_error(404, 'File Not Found: {}'.format(self.path))
            except Exception as e:
                # 处理异常情况
                self.send_error(500, 'Internal Server Error: {}'.format(str(e)))


        # 创建一个简单的 HTTP 服务器
    with socketserver.TCPServer(("0.0.0.0", port), MyHTTPRequestHandler) as httpd:
        # 启动服务器
        httpd.serve_forever()


    def create_local_server(root_path):
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(start_server, root_path)
        try:
            return future.result()  # 等待服务器线程完成
        except KeyboardInterrupt as e:
            e.with_traceback()
