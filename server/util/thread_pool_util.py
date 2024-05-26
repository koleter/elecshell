import os
from concurrent import futures

executor = futures.ThreadPoolExecutor(max_workers=os.cpu_count()*2)
