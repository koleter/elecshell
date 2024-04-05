import json
import logging
import os

from handler.pojo.conf.CachableConfig import CachableConfig

class GlobalAutoConfig(CachableConfig):

    def __init__(self, path):
        super().__init__(path, "autoConf.json")

    def default_conf(self):
        return dict({
            "xshListWindowWidth": 250
        })
