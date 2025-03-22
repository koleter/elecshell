from handler.pojo.conf.CachableConfig import CachableConfig

class ConfigableGlobalConfig(CachableConfig):
    """
    a class used by settings
    """

    def __init__(self, path):
        super().__init__(path, "configableGlobalConf.json")

    def default_conf(self):
        return dict({
            "namespace": "default",
            'strVariableSetting': []
        })
