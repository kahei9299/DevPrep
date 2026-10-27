from typing import List
class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        mn, mx = float('inf'), 0
        for p in prices:
            mn = min(mn, p)
            mx = max(mx, p - mn)
        return mx
