import re

from handler.ConfigHandler import configable_global_config


def _replace_variable(match):
    if len(match.groups()) == 0:
        return match.group()
    vs = configable_global_config.conf_cache["strVariableSetting"]
    if not vs:
        return match.group()
    subGroupStr = match.groups()[0]
    for item in vs:
        if item["name"] == subGroupStr:
            return item["value"]
    return match.group()


def getRealstr(str):
    '''
    用全局配置中的字符串变量替换str中的匹配字串
    '''
    if not str:
        return str
    return re.sub(r"{{(.*)}}", _replace_variable, str)
