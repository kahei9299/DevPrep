from typing import List
from collections import OrderedDict
class Solution:
    def runLruCache(self, operations: List[str], args: List[List[int]]) -> List[int]:
        res = []
        cache = OrderedDict()
        cap = args[0][0]
        for i in range(1, len(operations)):
            op = operations[i]
            if op == "get":
                key = args[i][0]
                if key in cache:
                    cache.move_to_end(key)
                    res.append(cache[key])
                else:
                    res.append(-1)
            elif op == "put":
                key, val = args[i][0], args[i][1]
                if key in cache: cache.move_to_end(key)
                cache[key] = val
                if len(cache) > cap: cache.popitem(last=False)
        return res
