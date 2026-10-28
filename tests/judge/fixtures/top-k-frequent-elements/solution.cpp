#include <vector>
#include <unordered_map>
#include <queue>
using namespace std;
class Solution {
public:
    vector<int> topKFrequent(vector<int>& nums, int k) {
        unordered_map<int,int> cnt;
        for (int n : nums) cnt[n]++;
        priority_queue<pair<int,int>> pq;
        for (auto& [v,c] : cnt) pq.push({c,v});
        vector<int> res;
        while (k--) { res.push_back(pq.top().second); pq.pop(); }
        return res;
    }
};
