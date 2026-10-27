#include <vector>
#include <algorithm>
using namespace std;
class Solution {
public:
    int maxProfit(vector<int>& prices) {
        int mn = INT_MAX, mx = 0;
        for (int p : prices) { mn = min(mn, p); mx = max(mx, p - mn); }
        return mx;
    }
};
