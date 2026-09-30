from handler.pojo.conf.CachableConfig import CachableConfig


class GlobalVariableConfig(CachableConfig):
    """
    跨命名空间共享的全局变量配置，与具体 workspace 无关
    """

    def __init__(self, path):
        super().__init__(path, "globalVariableConf.json")

    def default_conf(self):
        return dict({
            'strVariableSetting': []
        })
