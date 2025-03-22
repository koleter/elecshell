from handler.pojo.conf.CachableConfig import CachableConfig


class GlobalAutoConfig(CachableConfig):
    """
    used by some auto save action
    """

    def __init__(self, path):
        super().__init__(path, "autoConf.json")

    def default_conf(self):
        return dict({
            "xshListWindowWidth": 250
        })
