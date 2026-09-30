import re

from handler.ConfigHandler import configable_project_config, global_variable_config


def _find_variable_value(name):
    '''
    优先匹配当前 workspace 的变量，未匹配时回退到全局变量
    '''
    vs = configable_project_config.conf_cache.get("strVariableSetting")
    if vs:
        for item in vs:
            if item.get("name") == name:
                return item.get("value")
    global_vs = global_variable_config.conf_cache.get("strVariableSetting")
    if global_vs:
        for item in global_vs:
            if item.get("name") == name:
                return item.get("value")
    return None


def _replace_variable(match):
    if len(match.groups()) == 0:
        return match.group()
    value = _find_variable_value(match.groups()[0])
    if value is None:
        return match.group()
    return value


def getRealstr(str):
    '''
    用变量配置中的字符串变量替换str中的匹配字串，workspace 变量优先于全局变量
    '''
    if not str:
        return str
    return re.sub(r"{{(.*)}}", _replace_variable, str)
