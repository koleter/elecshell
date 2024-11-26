from handler.pojo.conf.CachableConfig import CachableConfig

class ProjectConfig(CachableConfig):
    """
    a class used by namespace
    """

    def __init__(self, path):
        super().__init__(path, "projectConfig.json")

    def default_conf(self):
        return dict({
            "namespace": "default",
            "language": "en-US"
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
