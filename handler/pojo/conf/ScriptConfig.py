import json
import os

from handler.const import OPERATION_SUCCESS
from handler.pojo.BaseConfig import BaseConfig
from handler.pojo.status import status_success, status_error
from utils import gen_id


class ScriptConfig(BaseConfig):

    def get(self):
        script_data = []
        for file in os.listdir(self.path):
            file_path = os.path.join(self.path, file)
            with open(file_path, 'r') as f:
                data = json.loads(f.read())
                script_data.append({
                    'title': {
                        'name': data['name']
                    },
                    'file': file,
                    'scriptOwner': data['scriptOwner'],
                    'scriptPath': data['scriptPath']
                })
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
            content = json.dumps({
                'scriptOwner': args['scriptOwner'],
                'scriptPath': args['scriptPath'],
                'name': args['name']
            })
            with open(absolute_path, 'w') as f:
                f.write(content)
            return status_success(OPERATION_SUCCESS)
        elif type == 'editScript':
            fake_file_path = args['file']
            real_file_path = self._get_real_path(fake_file_path)
            with open(real_file_path, 'r+') as f:
                data = json.loads(f.read())
                data['scriptPath'] = args['scriptPath']
                data['name'] = args['name']
                f.seek(0)
                f.truncate()
                f.write(json.dumps(data))
            return status_success(OPERATION_SUCCESS)

        return super().post(args)