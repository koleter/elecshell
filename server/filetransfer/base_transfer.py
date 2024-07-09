import re

ls_pattern = r'([\-dlbcps])([rwx\-]{8}[rwxtT\-])([\.\+])?\s+(\d+)\s+(\w+)\s+(\w+)\s+(\d+)\s+(.+\s+\d+\s+\d+(:\d+)?)\s+(.+)\r'


class BaseTransfer:
    def __init__(self, worker):
        self.worker = worker

    def create_remote_directory(self, path):
        """递归创建远程目录"""
        self.worker.recv(f'mkdir -p {path}; builtin history -d $((HISTCMD-1))\r', show_on_term=False)

    def get_remote_file_list(self, remote_path):
        def h(ctx, output, worker):
            if output:
                ret = []
                tp_list = re.findall(ls_pattern, output)
                for file_info in tp_list:
                    # file_info is a tuple like this: ('d', 'r-xr-xr-x', '.', '28', 'root', 'root', '4096', '6月   9 17:58', '.')
                    file_name = file_info[9]
                    if file_name == "." or file_name == "..":
                        continue
                    file_type = file_info[0]
                    if file_type == "l":
                        file_name = file_name.split(" -> ")[0]
                    item = dict()
                    item.setdefault("title", file_name)
                    item.setdefault("key", file_name)
                    item.setdefault("isLeaf", file_type != 'd')
                    ret.append(item)
                # print(output)
                ret.sort(key=lambda x: (x["isLeaf"], x["title"]))
                worker.handler.write_message({
                    'args': ret,
                    'method': 'refreshRemoteFileList',
                    'type': 'execSessionMethod'
                }, binary=False)

        # 获取远程路径下的文件和文件夹属性列表
        self.worker.recv(f'ls -al {remote_path}; builtin history -d $((HISTCMD-1))\r', h, [self.worker],
                         show_on_term=False)

    def get_remote_path(self, dir, file_name):
        if dir.endswith("/"):
            return dir + file_name
        return dir + "/" + file_name
