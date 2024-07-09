def b_is_error(msg):
    if b'Permission denied' in msg:
        return True
    return False
