#include <vector>
#include <algorithm>
using namespace std;
class Solution {
public:
    int minEatingSpeed(vector<int>& piles, int h) {
        int l = 1, r = *max_element(piles.begin(), piles.end());
        while (l < r) {
            int m = l + (r - l) / 2;
            long long hrs = 0;
            for (int p : piles) hrs += (p + m - 1) / m;
            if (hrs <= h) r = m; else l = m + 1;
        }
        return l;
    }
};
