def status_success(msg):
    return {
        'status': 'success',
        'msg': {
            'content': msg
        }
    }


def status_error(msg):
    return {
        'status': 'error',
        'msg': {
            'content': msg
        }
    }
