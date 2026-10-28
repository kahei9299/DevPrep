class Solution:
    def minWindow(self, s: str, t: str) -> str:
        if not t or len(s) < len(t): return ""
        need = [0] * 128
        required = 0
        for c in t:
            if need[ord(c)] == 0: required += 1
            need[ord(c)] += 1
        have = [0] * 128
        formed = 0
        l = 0
        bestLen = float('inf')
        bestL = 0
        for r in range(len(s)):
            c = ord(s[r])
            have[c] += 1
            if need[c] > 0 and have[c] == need[c]: formed += 1
            while l <= r and formed == required:
                if r - l + 1 < bestLen:
                    bestLen = r - l + 1
                    bestL = l
                cl = ord(s[l])
                have[cl] -= 1
                if need[cl] > 0 and have[cl] < need[cl]: formed -= 1
                l += 1
        return "" if bestLen == float('inf') else s[bestL:bestL+bestLen]
