#include <string>
#include <vector>
#include <unordered_map>
#include <list>
using namespace std;
class Solution {
public:
    vector<int> runLruCache(vector<string>& operations, vector<vector<int>>& args) {
        vector<int> res;
        int cap = args[0][0];
        list<pair<int,int>> lst;
        unordered_map<int, list<pair<int,int>>::iterator> mp;
        for (int i = 1; i < (int)operations.size(); i++) {
            if (operations[i] == "get") {
                int key = args[i][0];
                if (mp.count(key)) {
                    lst.splice(lst.end(), lst, mp[key]);
                    res.push_back(mp[key]->second);
                } else res.push_back(-1);
            } else if (operations[i] == "put") {
                int key = args[i][0], val = args[i][1];
                if (mp.count(key)) {
                    mp[key]->second = val;
                    lst.splice(lst.end(), lst, mp[key]);
                } else {
                    if ((int)lst.size() == cap) {
                        mp.erase(lst.front().first);
                        lst.pop_front();
                    }
                    lst.push_back({key, val});
                    mp[key] = prev(lst.end());
                }
            }
        }
        return res;
    }
};
