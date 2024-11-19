from handler.pojo.conf.CachableConfig import CachableConfig

class NameSpaceConfig(CachableConfig):
    """
    a class used by namespace
    """

    def __init__(self, path):
        super().__init__(path, "namespace.json")

    def default_conf(self):
        return dict({
            "namespace": "default"
        })
