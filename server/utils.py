import ipaddress
import re


try:
    import secrets
except ImportError:
    secrets = None

from uuid import uuid4

try:
    from types import UnicodeType
except ImportError:
    UnicodeType = str

try:
    from urllib.parse import urlparse
except ImportError:
    from urlparse import urlparse



numeric = re.compile(r'[0-9]+$')
allowed = re.compile(r'(?!-)[a-z0-9-]{1,63}(?<!-)$', re.IGNORECASE)


def to_str(bstr, encoding='utf-8'):
    if isinstance(bstr, bytes):
        return bstr.decode(encoding)
    return bstr


def to_bytes(ustr, encoding='utf-8'):
    if isinstance(ustr, UnicodeType):
        return ustr.encode(encoding)
    return ustr


def to_int(string):
    try:
        return int(string)
    except (TypeError, ValueError):
        pass


def to_ip_address(ipstr):
    ip = to_str(ipstr)
    if ip.startswith('fe80::'):
        ip = ip.split('%')[0]
    return ipaddress.ip_address(ip)


def is_valid_ip_address(ipstr):
    try:
        to_ip_address(ipstr)
    except ValueError:
        return False
    return True


def is_valid_port(port):
    return 0 < port < 65536


def is_valid_encoding(encoding):
    try:
        u'test'.encode(encoding)
    except LookupError:
        return False
    except ValueError:
        return False
    return True


def is_ip_hostname(hostname):
    it = iter(hostname)
    if next(it) == '[':
        return True
    for ch in it:
        if ch != '.' and not ch.isdigit():
            return False
    return True


def is_valid_hostname(hostname):
    if hostname[-1] == '.':
        # strip exactly one dot from the right, if present
        hostname = hostname[:-1]
    if len(hostname) > 253:
        return False

    labels = hostname.split('.')

    # the TLD must be not all-numeric
    if numeric.match(labels[-1]):
        return False

    return all(allowed.match(label) for label in labels)


def is_same_primary_domain(domain1, domain2):
    i = -1
    dots = 0
    l1 = len(domain1)
    l2 = len(domain2)
    m = min(l1, l2)

    while i >= -m:
        c1 = domain1[i]
        c2 = domain2[i]

        if c1 == c2:
            if c1 == '.':
                dots += 1
                if dots == 2:
                    return True
        else:
            return False

        i -= 1

    if l1 == l2:
        return True

    if dots == 0:
        return False

    c = domain1[i] if l1 > m else domain2[i]
    return c == '.'


def parse_origin_from_url(url):
    url = url.strip()
    if not url:
        return

    if not (url.startswith('http://') or url.startswith('https://') or
            url.startswith('//')):
        url = '//' + url

    parsed = urlparse(url)
    port = parsed.port
    scheme = parsed.scheme

    if scheme == '':
        scheme = 'https' if port == 443 else 'http'

    if port == 443 and scheme == 'https':
        netloc = parsed.netloc.replace(':443', '')
    elif port == 80 and scheme == 'http':
        netloc = parsed.netloc.replace(':80', '')
    else:
        netloc = parsed.netloc

    return '{}://{}'.format(scheme, netloc)


def find_sub_str_index(str, substr, count=1):
    """
    找到在str中出现了指定次数的substr的下标,若没有找到返回-1
    """
    res = -1
    idx = 0
    for i in range(count):
        res = str.find(substr, idx)
        if res == -1:
            return res
        idx = res + 1
    return res


def reset_font(s):
    # 参考https://blog.csdn.net/weixin_43988842/article/details/106169040
    ansi_escape = re.compile(
        # 自行发现的控制序列
        r'(\x1b\][12];)|'
        r'(\x1b\[\?1l)|'
        # ESC 非转义控制序列
        r'(\x1b[cDEHMZ78>=])|'
        r'(\x1b(%n|#8|\(n|\)n))|'
        # ESC 控制转义序列
        r'(\x1b\[([LMJAPXacefmnsu]|n[A-GJKSTdghiIq`]|\d+?;\d+?H|\?nK|\d+?;\d+?r))|'
        # ECMA-48 模式选择
        r'(\x1b\[([2-5][Ih]|20[Ih]))|'
        # DEC 私有模式序列
        r'(\x1b\[\?([13-9]|25|67|1000)h)|'
        # 终端屏幕尺寸设置
        r'(\x1b\[=([0-7]|1[3-9])h)|'
        # ECMA-48 状态报告命令
        r'(\x1b\[([56]|\?[12]5)n)|'
        # SGR 参数意义 （\x1b[…m）
        r'(\x1b\[(([0-9])|(1[0-2])|(2[12457-9])|(3[0-9])|(4[0-8])|(5[35])|(9[0-7])|(10[0-7]))m)|'
        # SGR指令能够在一条指令中添加多个属性
        # r'(\x1b\[38;2;\d+?;\d+?;\d+?m)|'
        # r'(\x1b\[48;2;\d+?;\d+?;\d+?m)|'
        r'(\x1b\[(\d+;){1,5}\d+m)|'
        # 参考文档中的转义序列,将其排为低优先级
        r'(\x1b[\[\]])|'
        # 控制字符
        r'(\x00|\x05|\x07|\x08|\x09|\x0b|\x0c|\x0e|\x0f|\x11|\x13|\x18|\x1a|\x1b|\x7f|\x9b)'
        # \r和\n,也属于控制字符,但是保留
        # r'\x0a|\x0d'
    )
    return ansi_escape.sub('', s)


def gen_id():
    return secrets.token_urlsafe(nbytes=32) if secrets else uuid4().hex

