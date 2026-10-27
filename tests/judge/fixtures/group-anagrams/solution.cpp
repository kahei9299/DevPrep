#include <vector>
#include <string>
#include <unordered_map>
#include <algorithm>
using namespace std;
class Solution {
public:
    vector<vector<string>> groupAnagrams(vector<string>& strs) {
        unordered_map<string, vector<string>> m;
        for (auto& s : strs) {
            string k = s;
            sort(k.begin(), k.end());
            m[k].push_back(s);
        }
        vector<vector<string>> res;
        for (auto& [k, v] : m) res.push_back(v);
        return res;
    }
};
