class Solution:
    def isValid(self, s: str) -> bool:
        st = []
        m = {')':'(', ']':'[', '}':'{'}
        for c in s:
            if c in m:
                if not st or st[-1] != m[c]: return False
                st.pop()
            else: st.append(c)
        return not st
