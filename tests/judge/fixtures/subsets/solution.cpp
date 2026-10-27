#include <vector>
using namespace std;
class Solution {
public:
    vector<vector<int>> subsets(vector<int>& nums) {
        vector<vector<int>> res = {{}};
        for (int n : nums) {
            int sz = res.size();
            for (int i = 0; i < sz; i++) {
                auto s = res[i];
                s.push_back(n);
                res.push_back(s);
            }
        }
        return res;
    }
};
