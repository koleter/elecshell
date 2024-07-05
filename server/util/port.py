import socket


def get_unused_port():
    for port in range(10000, 65000):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        result = sock.connect_ex(("localhost", port))
        if result != 0:
            return port
