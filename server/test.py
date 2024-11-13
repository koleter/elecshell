import json
import os

def list_directory_contents(path):
    """
    递归地列出目录下的所有文件和文件夹，并返回一个包含层级关系的列表。

    :param path: 要遍历的目录路径
    :return: 包含所有文件和文件夹路径的列表，保留层级关系
    """
    def _list_contents(path, indent=0):
        entries = []
        try:
            # 列出当前目录下的所有文件和文件夹
            for entry in os.listdir(path):
                entry_path = os.path.join(path, entry)
                if os.path.isdir(entry_path):
                    # 如果是文件夹，递归调用
                    entries.append(('D', entry, _list_contents(entry_path, indent + 1)))
                else:
                    # 如果是文件，直接添加
                    entries.append(('F', entry))
        except OSError as e:
            print("无法访问目录 {}: {}".format(path, e))
        return entries

    return _list_contents(path)

# 示例目录路径
directory_path = '..'

# 调用函数
contents = list_directory_contents(directory_path)

# 打印结果
def print_contents(contents, indent=0):
    for item in contents:
        if item[0] == 'D':
            print(' ' * indent + 'D: ' + item[1])
            print_contents(item[2], indent + 4)
        else:
            print(' ' * indent + 'F: ' + item[1])

# print_contents(contents)
print(json.dumps(contents))
