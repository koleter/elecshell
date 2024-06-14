import psutil

def find_process_by_port(port):
    for proc in psutil.process_iter(['pid', 'name', 'connections']):
        try:
            for conn in proc.connections():
                if conn.laddr.port == port:
                    return proc
        except psutil.AccessDenied:
            continue
    return None

def kill_process_by_port(port):
    process = find_process_by_port(port)
    if process:
        print(f"Killing process {process.pid}")
        process.kill()
    else:
        print(f"No process found listening on port {port}")

