import os


# 根据文件路径获取根路径
def get_root_dir_path(file_path):
    parts = file_path.split(os.sep)
    return parts[0]


