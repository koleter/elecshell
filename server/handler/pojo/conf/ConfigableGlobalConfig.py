import json
import logging
import os

from handler.pojo.conf.CachableConfig import CachableConfig

class ConfigableGlobalConfig(CachableConfig):

    def __init__(self, path):
        super().__init__(path, "configableGlobalConf.json")
