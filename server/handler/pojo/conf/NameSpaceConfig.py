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

    def post(self, args):
        '''
        switch namespace
        :param args:
        :return:
        '''
        result = super().post(args)
        from handler.ConfigHandler import initialize_confs
        initialize_confs()
        return result
