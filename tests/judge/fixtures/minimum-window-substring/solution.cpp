#include <string>
#include <unordered_map>
using namespace std;
class Solution {
public:
    string minWindow(string s, string t) {
        unordered_map<char,int> need;
        for (char c : t) need[c]++;
        int missing = t.size(), l = 0, start = 0, len = INT_MAX;
        for (int r = 0; r < s.size(); r++) {
            if (need[s[r]]-- > 0) missing--;
            while (missing == 0) {
                if (r - l + 1 < len) { len = r - l + 1; start = l; }
                if (++need[s[l]] > 0) missing++;
                l++;
            }
        }
        return len == INT_MAX ? "" : s.substr(start, len);
    }
};
