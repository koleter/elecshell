import json
import os
import shutil

from handler.pojo.conf.BaseConfig import BaseConfig
from handler.pojo.status import status_success
from utils import gen_id


class SessionConfig(BaseConfig):
    def _file_listdir_dfs(self, parent_item, dir, session_conf_info):
        for file in os.listdir(self._get_real_path(dir)):
            if not parent_item.get('children'):
                parent_item.setdefault('children', [])
            relative_file_path = os.path.join(dir, file)
            if os.path.isdir(self._get_real_path(relative_file_path)):
                file_item = {
                    'title': file,
                    'key': relative_file_path,
                    'path': relative_file_path,
                    'isLeaf': False
                }
                self._file_listdir_dfs(file_item, relative_file_path, session_conf_info)
                parent_item.get('children').append(file_item)
            else:
                with open(self._get_real_path(relative_file_path), 'r') as f:
                    data = json.loads(f.read())
                session_conf_info[file] = relative_file_path
                parent_item.get('children').append({
                    'title': data['sessionName'],
                    'key': file,
                    'path': relative_file_path,
                    'isLeaf': True
                })
        def sort(item):
            return (1 if item['isLeaf'] else -1, item['title'])

        if parent_item.get('children') is not None:
            parent_item.get('children').sort(key=sort)

    def get(self):
        default_root_dir = {
            'title': "root",
            'key': '',
            'path': "",
            'isLeaf': False
        }
        session_conf_info = dict()
        if os.path.exists(self.path):
            self._file_listdir_dfs(default_root_dir, '', session_conf_info)
        return {
            'status': 'success',
            'defaultTreeData': [default_root_dir],
            'sessionConfInfo': session_conf_info
        }

    def _copy_session_dir(self, src_dir_path, dst_dir_path):
        for file in os.listdir(src_dir_path):
            file_path = os.path.join(src_dir_path, file)
            if os.path.isdir(file_path):
                new_dst_path = os.path.join(dst_dir_path, file)
                os.mkdir(new_dst_path)
                self._copy_session_dir(file_path, new_dst_path)
            else:
                with open(file_path, 'r') as f:
                    data = json.loads(f.read())
                file_name = gen_id()
                data['key'] = file_name
                login_script_list = data.get('login_script')
                if login_script_list:
                    for entry in login_script_list:
                        entry['id'] = gen_id()
                new_file_path = os.path.join(dst_dir_path, file_name)
                with open(new_file_path, 'w') as f:
                    f.write(json.dumps(data))

    def post(self, args):
        type = args['type']
        if type == 'editSession':
            session_info = args['sessionInfo']
            src = self._get_real_path(args['src'])
            with open(src, 'w') as f:
                f.write(json.dumps(session_info))
            return status_success('opration success')
        elif type == 'duplicate':
            origin_file = os.path.join(self.path, args['path'])
            if os.path.isdir(origin_file):
                new_dir_name = origin_file + ' - copy'
                while True:
                    if os.path.exists(new_dir_name):
                        new_dir_name += ' - copy'
                        continue
                    break
                os.mkdir(new_dir_name)
                self._copy_session_dir(origin_file, new_dir_name)
                return status_success('opration success')
            else:
                with open(origin_file, 'r') as f:
                    data = json.loads(f.read())
                data['sessionName'] += ' - copy'
                file_name = gen_id()
                data['key'] = file_name
                login_script_list = data.get('login_script')
                if login_script_list:
                    for entry in login_script_list:
                        entry['id'] = gen_id()
                new_file_path = os.path.join(os.path.dirname(origin_file), file_name)
                with open(new_file_path, 'w') as f:
                    f.write(json.dumps(data))
                return status_success('opration success')

        return super().post(args)
