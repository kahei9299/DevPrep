from typing import List
class Solution:
    def groupAnagrams(self, strs: List[str]) -> List[List[str]]:
        d = {}
        for s in strs:
            k = ''.join(sorted(s))
            d.setdefault(k, []).append(s)
        return list(d.values())
