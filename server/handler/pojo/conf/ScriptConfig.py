import json
import logging
import os

from handler.const import OPERATION_SUCCESS
from handler.pojo.conf.BaseConfig import BaseConfig
from handler.pojo.status import status_success, status_error
from utils import gen_id

TYPE_RUN_SCRIPT = 1
TYPE_SEND_STRING = 2

script_properties = ['scriptOwner', 'scriptType', 'scriptPath', 'strings']

class ScriptConfig(BaseConfig):

    def get(self):
        script_data = []
        for file in os.listdir(self.path):
            file_path = os.path.join(self.path, file)
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.loads(f.read())
                script_item = {
                    'title': {
                        'name': data['name']
                    },
                    'file': file,
                }
                for key in script_properties:
                    script_item.update({key: data.get(key)})
                script_data.append(script_item)

        return {
            'status': 'success',
            'scriptData': script_data
        }

    def post(self, args):
        type = args['type']
        if type == 'addFile':
            file_name = gen_id()
            absolute_path = os.path.join(self.path, file_name)
            if os.path.exists(absolute_path):
                return status_error("script {} already exists".format(file_name))
            with open(absolute_path, 'w', encoding='utf-8') as f:
                f.write(args['content'])
            return status_success(OPERATION_SUCCESS)
        elif type == 'editScript':
            fake_file_path = args['file']
            real_file_path = self._get_real_path(fake_file_path)
            with open(real_file_path, 'r+', encoding='utf-8') as f:
                data = json.loads(f.read())
                data['scriptPath'] = args.get('scriptPath')
                data['name'] = args['name']
                data['scriptType'] = args['scriptType']
                data['strings'] = args.get('strings')
                for key in script_properties:
                    data[key] = args.get(key)
                f.seek(0)
                f.truncate()
                f.write(json.dumps(data, ensure_ascii=False))
            return status_success(OPERATION_SUCCESS)

        return super().post(args)
