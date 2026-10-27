#!/usr/bin/env node
/**
 * M0.1 Judge Verification Script
 *
 * Tests representative problems against the running Cojudge dev server.
 * Requires: npm run dev (server at localhost:5173) + Docker running.
 *
 * Usage:
 *   node scripts/verify-judge.mjs                    # Run all tests
 *   node scripts/verify-judge.mjs --problem two-sum  # Single problem
 *   node scripts/verify-judge.mjs --lang python      # Single language
 *   node scripts/verify-judge.mjs --csv output.csv   # Write CSV results
 */

const BASE = process.env.COJUDGE_URL || 'http://localhost:5173'
const POLL_INTERVAL = 2000
const POLL_TIMEOUT = 120000

// ─── Correct solutions for 20 representative problems ───

const SOLUTIONS = {
  'two-sum': {
    python: `from typing import List
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, n in enumerate(nums):
            if target - n in seen:
                return [seen[target - n], i]
            seen[n] = i
        return []`,
    cpp: `#include <vector>
#include <unordered_map>
using namespace std;
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int,int> m;
        for (int i = 0; i < nums.size(); i++) {
            if (m.count(target - nums[i])) return {m[target-nums[i]], i};
            m[nums[i]] = i;
        }
        return {};
    }
};`,
    java: `import java.util.*;
class Solution {
    public int[] twoSum(int[] nums, int target) {
        Map<Integer,Integer> m = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            if (m.containsKey(target - nums[i])) return new int[]{m.get(target-nums[i]), i};
            m.put(nums[i], i);
        }
        return new int[]{};
    }
}`
  },
  'group-anagrams': {
    python: `from typing import List
class Solution:
    def groupAnagrams(self, strs: List[str]) -> List[List[str]]:
        d = {}
        for s in strs:
            k = ''.join(sorted(s))
            d.setdefault(k, []).append(s)
        return list(d.values())`,
    cpp: `#include <vector>
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
};`,
    java: `import java.util.*;
class Solution {
    public List<List<String>> groupAnagrams(String[] strs) {
        Map<String, List<String>> m = new HashMap<>();
        for (String s : strs) {
            char[] c = s.toCharArray();
            Arrays.sort(c);
            String k = new String(c);
            m.computeIfAbsent(k, x -> new ArrayList<>()).add(s);
        }
        return new ArrayList<>(m.values());
    }
}`
  },
  'valid-palindrome': {
    python: `class Solution:
    def isPalindrome(self, s: str) -> bool:
        l, r = 0, len(s) - 1
        while l < r:
            while l < r and not s[l].isalnum(): l += 1
            while l < r and not s[r].isalnum(): r -= 1
            if s[l].lower() != s[r].lower(): return False
            l += 1; r -= 1
        return True`,
    cpp: `#include <string>
using namespace std;
class Solution {
public:
    bool isPalindrome(string s) {
        int l = 0, r = s.size() - 1;
        while (l < r) {
            while (l < r && !isalnum(s[l])) l++;
            while (l < r && !isalnum(s[r])) r--;
            if (tolower(s[l]) != tolower(s[r])) return false;
            l++; r--;
        }
        return true;
    }
};`,
    java: `class Solution {
    public boolean isPalindrome(String s) {
        int l = 0, r = s.length() - 1;
        while (l < r) {
            while (l < r && !Character.isLetterOrDigit(s.charAt(l))) l++;
            while (l < r && !Character.isLetterOrDigit(s.charAt(r))) r--;
            if (Character.toLowerCase(s.charAt(l)) != Character.toLowerCase(s.charAt(r))) return false;
            l++; r--;
        }
        return true;
    }
}`
  },
  '3sum': {
    python: `from typing import List
class Solution:
    def threeSum(self, nums: List[int]) -> List[List[int]]:
        nums.sort()
        res = []
        for i in range(len(nums) - 2):
            if i > 0 and nums[i] == nums[i-1]: continue
            l, r = i + 1, len(nums) - 1
            while l < r:
                s = nums[i] + nums[l] + nums[r]
                if s < 0: l += 1
                elif s > 0: r -= 1
                else:
                    res.append([nums[i], nums[l], nums[r]])
                    while l < r and nums[l] == nums[l+1]: l += 1
                    while l < r and nums[r] == nums[r-1]: r -= 1
                    l += 1; r -= 1
        return res`,
    cpp: `#include <vector>
#include <algorithm>
using namespace std;
class Solution {
public:
    vector<vector<int>> threeSum(vector<int>& nums) {
        sort(nums.begin(), nums.end());
        vector<vector<int>> res;
        for (int i = 0; i < (int)nums.size() - 2; i++) {
            if (i > 0 && nums[i] == nums[i-1]) continue;
            int l = i+1, r = nums.size()-1;
            while (l < r) {
                int s = nums[i]+nums[l]+nums[r];
                if (s < 0) l++;
                else if (s > 0) r--;
                else {
                    res.push_back({nums[i],nums[l],nums[r]});
                    while (l < r && nums[l]==nums[l+1]) l++;
                    while (l < r && nums[r]==nums[r-1]) r--;
                    l++; r--;
                }
            }
        }
        return res;
    }
};`,
    java: `import java.util.*;
class Solution {
    public int[][] threeSum(int[] nums) {
        Arrays.sort(nums);
        List<int[]> res = new ArrayList<>();
        for (int i = 0; i < nums.length - 2; i++) {
            if (i > 0 && nums[i] == nums[i-1]) continue;
            int l = i+1, r = nums.length-1;
            while (l < r) {
                int s = nums[i]+nums[l]+nums[r];
                if (s < 0) l++;
                else if (s > 0) r--;
                else {
                    res.add(new int[]{nums[i],nums[l],nums[r]});
                    while (l < r && nums[l]==nums[l+1]) l++;
                    while (l < r && nums[r]==nums[r-1]) r--;
                    l++; r--;
                }
            }
        }
        return res.toArray(new int[0][]);
    }
}`
  },
  'best-time-to-buy-and-sell-stock': {
    python: `from typing import List
class Solution:
    def maxProfit(self, prices: List[int]) -> int:
        mn, mx = float('inf'), 0
        for p in prices:
            mn = min(mn, p)
            mx = max(mx, p - mn)
        return mx`,
    cpp: `#include <vector>
#include <algorithm>
using namespace std;
class Solution {
public:
    int maxProfit(vector<int>& prices) {
        int mn = INT_MAX, mx = 0;
        for (int p : prices) { mn = min(mn, p); mx = max(mx, p - mn); }
        return mx;
    }
};`,
    java: `class Solution {
    public int maxProfit(int[] prices) {
        int mn = Integer.MAX_VALUE, mx = 0;
        for (int p : prices) { mn = Math.min(mn, p); mx = Math.max(mx, p - mn); }
        return mx;
    }
}`
  },
  'minimum-window-substring': {
    python: `class Solution:
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
        return "" if bestLen == float('inf') else s[bestL:bestL+bestLen]`,
    cpp: `#include <string>
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
};`,
    java: `import java.util.*;
class Solution {
    public String minWindow(String s, String t) {
        int[] need = new int[128];
        for (char c : t.toCharArray()) need[c]++;
        int missing = t.length(), l = 0, start = 0, len = Integer.MAX_VALUE;
        for (int r = 0; r < s.length(); r++) {
            if (need[s.charAt(r)]-- > 0) missing--;
            while (missing == 0) {
                if (r - l + 1 < len) { len = r - l + 1; start = l; }
                if (++need[s.charAt(l)] > 0) missing++;
                l++;
            }
        }
        return len == Integer.MAX_VALUE ? "" : s.substring(start, start + len);
    }
}`
  },
  'valid-parentheses': {
    python: `class Solution:
    def isValid(self, s: str) -> bool:
        st = []
        m = {')':'(', ']':'[', '}':'{'}
        for c in s:
            if c in m:
                if not st or st[-1] != m[c]: return False
                st.pop()
            else: st.append(c)
        return not st`,
    cpp: `#include <string>
#include <stack>
using namespace std;
class Solution {
public:
    bool isValid(string s) {
        stack<char> st;
        for (char c : s) {
            if (c=='('||c=='['||c=='{') st.push(c);
            else {
                if (st.empty()) return false;
                if (c==')' && st.top()!='(') return false;
                if (c==']' && st.top()!='[') return false;
                if (c=='}' && st.top()!='{') return false;
                st.pop();
            }
        }
        return st.empty();
    }
};`,
    java: `import java.util.*;
class Solution {
    public boolean isValid(String s) {
        Stack<Character> st = new Stack<>();
        for (char c : s.toCharArray()) {
            if (c=='('||c=='['||c=='{') st.push(c);
            else {
                if (st.isEmpty()) return false;
                if (c==')' && st.peek()!='(') return false;
                if (c==']' && st.peek()!='[') return false;
                if (c=='}' && st.peek()!='{') return false;
                st.pop();
            }
        }
        return st.isEmpty();
    }
}`
  },
  'binary-search': {
    python: `from typing import List
class Solution:
    def search(self, nums: List[int], target: int) -> int:
        l, r = 0, len(nums) - 1
        while l <= r:
            m = (l + r) // 2
            if nums[m] == target: return m
            elif nums[m] < target: l = m + 1
            else: r = m - 1
        return -1`,
    cpp: `#include <vector>
using namespace std;
class Solution {
public:
    int search(vector<int>& nums, int target) {
        int l = 0, r = nums.size() - 1;
        while (l <= r) {
            int m = l + (r - l) / 2;
            if (nums[m] == target) return m;
            else if (nums[m] < target) l = m + 1;
            else r = m - 1;
        }
        return -1;
    }
};`,
    java: `class Solution {
    public int search(int[] nums, int target) {
        int l = 0, r = nums.length - 1;
        while (l <= r) {
            int m = l + (r - l) / 2;
            if (nums[m] == target) return m;
            else if (nums[m] < target) l = m + 1;
            else r = m - 1;
        }
        return -1;
    }
}`
  },
  'koko-eating-bananas': {
    python: `from typing import List
import math
class Solution:
    def minEatingSpeed(self, piles: List[int], h: int) -> int:
        l, r = 1, max(piles)
        while l < r:
            m = (l + r) // 2
            if sum(math.ceil(p / m) for p in piles) <= h: r = m
            else: l = m + 1
        return l`,
    cpp: `#include <vector>
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
};`,
    java: `class Solution {
    public int minEatingSpeed(int[] piles, int h) {
        int l = 1, r = 0;
        for (int p : piles) r = Math.max(r, p);
        while (l < r) {
            int m = l + (r - l) / 2;
            long hrs = 0;
            for (int p : piles) hrs += (p + m - 1) / m;
            if (hrs <= h) r = m; else l = m + 1;
        }
        return l;
    }
}`
  },
  'reverse-linked-list': {
    python: `from typing import Optional
class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        while head:
            nxt = head.next
            head.next = prev
            prev = head
            head = nxt
        return prev`,
    cpp: `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        while (head) {
            ListNode* nxt = head->next;
            head->next = prev;
            prev = head;
            head = nxt;
        }
        return prev;
    }
};`,
    java: `class Solution {
    public ListNode reverseList(ListNode head) {
        ListNode prev = null;
        while (head != null) {
            ListNode nxt = head.next;
            head.next = prev;
            prev = head;
            head = nxt;
        }
        return prev;
    }
}`
  },
  'lru-cache': {
    python: `from typing import List
from collections import OrderedDict
class Solution:
    def runLruCache(self, operations: List[str], args: List[List[int]]) -> List[int]:
        res = []
        cache = OrderedDict()
        cap = args[0][0]
        for i in range(1, len(operations)):
            op = operations[i]
            if op == "get":
                key = args[i][0]
                if key in cache:
                    cache.move_to_end(key)
                    res.append(cache[key])
                else:
                    res.append(-1)
            elif op == "put":
                key, val = args[i][0], args[i][1]
                if key in cache: cache.move_to_end(key)
                cache[key] = val
                if len(cache) > cap: cache.popitem(last=False)
        return res`,
    cpp: `#include <string>
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
};`,
    java: `import java.util.*;
class Solution {
    public int[] runLruCache(String[] operations, int[][] args) {
        List<Integer> res = new ArrayList<>();
        int cap = args[0][0];
        LinkedHashMap<Integer,Integer> map = new LinkedHashMap<>(16, 0.75f, true);
        for (int i = 1; i < operations.length; i++) {
            if ("get".equals(operations[i])) {
                Integer v = map.get(args[i][0]);
                res.add(v == null ? -1 : v);
            } else if ("put".equals(operations[i])) {
                map.put(args[i][0], args[i][1]);
                if (map.size() > cap) {
                    Iterator<Map.Entry<Integer,Integer>> it = map.entrySet().iterator();
                    it.next(); it.remove();
                }
            }
        }
        return res.stream().mapToInt(Integer::intValue).toArray();
    }
}`
  },
  'invert-binary-tree': {
    python: `from typing import Optional
class Solution:
    def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:
        if not root: return None
        root.left, root.right = self.invertTree(root.right), self.invertTree(root.left)
        return root`,
    cpp: `class Solution {
public:
    TreeNode* invertTree(TreeNode* root) {
        if (!root) return nullptr;
        TreeNode* tmp = root->left;
        root->left = invertTree(root->right);
        root->right = invertTree(tmp);
        return root;
    }
};`,
    java: `class Solution {
    public TreeNode invertTree(TreeNode root) {
        if (root == null) return null;
        TreeNode tmp = root.left;
        root.left = invertTree(root.right);
        root.right = invertTree(tmp);
        return root;
    }
}`
  },
  'serialize-and-deserialize-binary-tree': {
    python: `class Codec:
    def serialize(self, root):
        if not root: return "null"
        return str(root.val) + "," + self.serialize(root.left) + "," + self.serialize(root.right)
    def deserialize(self, data):
        vals = iter(data.split(","))
        def build():
            v = next(vals)
            if v == "null": return None
            node = TreeNode(int(v))
            node.left = build()
            node.right = build()
            return node
        return build()`,
    cpp: `#include <string>
#include <sstream>
using namespace std;
class Codec {
public:
    string serialize(TreeNode* root) {
        if (!root) return "null";
        return to_string(root->val) + "," + serialize(root->left) + "," + serialize(root->right);
    }
    TreeNode* deserialize(string data) {
        istringstream ss(data);
        return build(ss);
    }
private:
    TreeNode* build(istringstream& ss) {
        string val;
        getline(ss, val, ',');
        if (val == "null") return nullptr;
        TreeNode* node = new TreeNode(stoi(val));
        node->left = build(ss);
        node->right = build(ss);
        return node;
    }
};`,
    java: `import java.util.*;
class Codec {
    public String serialize(TreeNode root) {
        if (root == null) return "null";
        return root.val + "," + serialize(root.left) + "," + serialize(root.right);
    }
    public TreeNode deserialize(String data) {
        Queue<String> q = new LinkedList<>(Arrays.asList(data.split(",")));
        return build(q);
    }
    private TreeNode build(Queue<String> q) {
        String v = q.poll();
        if ("null".equals(v)) return null;
        TreeNode node = new TreeNode(Integer.parseInt(v));
        node.left = build(q);
        node.right = build(q);
        return node;
    }
}`
  },
  'implement-trie-prefix-tree': {
    python: `class Trie:
    def __init__(self):
        self.children = {}
        self.end = False
    def insert(self, word: str) -> None:
        node = self
        for c in word:
            if c not in node.children: node.children[c] = Trie()
            node = node.children[c]
        node.end = True
    def search(self, word: str) -> bool:
        node = self
        for c in word:
            if c not in node.children: return False
            node = node.children[c]
        return node.end
    def startsWith(self, prefix: str) -> bool:
        node = self
        for c in prefix:
            if c not in node.children: return False
            node = node.children[c]
        return True`,
    cpp: `#include <string>
using namespace std;
class Trie {
    Trie* ch[26] = {};
    bool isEnd = false;
public:
    Trie() {}
    void insert(string word) {
        Trie* n = this;
        for (char c : word) {
            if (!n->ch[c-'a']) n->ch[c-'a'] = new Trie();
            n = n->ch[c-'a'];
        }
        n->isEnd = true;
    }
    bool search(string word) {
        Trie* n = this;
        for (char c : word) {
            if (!n->ch[c-'a']) return false;
            n = n->ch[c-'a'];
        }
        return n->isEnd;
    }
    bool startsWith(string prefix) {
        Trie* n = this;
        for (char c : prefix) {
            if (!n->ch[c-'a']) return false;
            n = n->ch[c-'a'];
        }
        return true;
    }
};`,
    java: `class Trie {
    Trie[] ch = new Trie[26];
    boolean isEnd;
    public Trie() {}
    public void insert(String word) {
        Trie n = this;
        for (char c : word.toCharArray()) {
            if (n.ch[c-'a'] == null) n.ch[c-'a'] = new Trie();
            n = n.ch[c-'a'];
        }
        n.isEnd = true;
    }
    public boolean search(String word) {
        Trie n = this;
        for (char c : word.toCharArray()) {
            if (n.ch[c-'a'] == null) return false;
            n = n.ch[c-'a'];
        }
        return n.isEnd;
    }
    public boolean startsWith(String prefix) {
        Trie n = this;
        for (char c : prefix.toCharArray()) {
            if (n.ch[c-'a'] == null) return false;
            n = n.ch[c-'a'];
        }
        return true;
    }
}`
  },
  'top-k-frequent-elements': {
    python: `from typing import List
from collections import Counter
class Solution:
    def topKFrequent(self, nums: List[int], k: int) -> List[int]:
        return [x for x, _ in Counter(nums).most_common(k)]`,
    cpp: `#include <vector>
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
};`,
    java: `import java.util.*;
class Solution {
    public int[] topKFrequent(int[] nums, int k) {
        Map<Integer,Integer> cnt = new HashMap<>();
        for (int n : nums) cnt.merge(n, 1, Integer::sum);
        PriorityQueue<int[]> pq = new PriorityQueue<>((a,b) -> b[1]-a[1]);
        for (var e : cnt.entrySet()) pq.offer(new int[]{e.getKey(), e.getValue()});
        int[] res = new int[k];
        for (int i = 0; i < k; i++) res[i] = pq.poll()[0];
        return res;
    }
}`
  },
  'find-median-from-data-stream': {
    python: `import heapq
class MedianFinder:
    def __init__(self):
        self.lo = []
        self.hi = []
    def addNum(self, num: int) -> None:
        heapq.heappush(self.lo, -num)
        heapq.heappush(self.hi, -heapq.heappop(self.lo))
        if len(self.hi) > len(self.lo):
            heapq.heappush(self.lo, -heapq.heappop(self.hi))
    def findMedian(self) -> float:
        if len(self.lo) > len(self.hi): return -self.lo[0]
        return (-self.lo[0] + self.hi[0]) / 2.0`,
    cpp: `#include <queue>
using namespace std;
class MedianFinder {
    priority_queue<int> lo;
    priority_queue<int, vector<int>, greater<int>> hi;
public:
    MedianFinder() {}
    void addNum(int num) {
        lo.push(num);
        hi.push(lo.top()); lo.pop();
        if (hi.size() > lo.size()) { lo.push(hi.top()); hi.pop(); }
    }
    double findMedian() {
        if (lo.size() > hi.size()) return lo.top();
        return (lo.top() + hi.top()) / 2.0;
    }
};`,
    java: `import java.util.*;
class MedianFinder {
    PriorityQueue<Integer> lo = new PriorityQueue<>(Collections.reverseOrder());
    PriorityQueue<Integer> hi = new PriorityQueue<>();
    public MedianFinder() {}
    public void addNum(int num) {
        lo.offer(num);
        hi.offer(lo.poll());
        if (hi.size() > lo.size()) lo.offer(hi.poll());
    }
    public double findMedian() {
        if (lo.size() > hi.size()) return lo.peek();
        return (lo.peek() + hi.peek()) / 2.0;
    }
}`
  },
  'subsets': {
    python: `from typing import List
class Solution:
    def subsets(self, nums: List[int]) -> List[List[int]]:
        res = [[]]
        for n in nums:
            res += [s + [n] for s in res]
        return res`,
    cpp: `#include <vector>
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
};`,
    java: `import java.util.*;
class Solution {
    public int[][] subsets(int[] nums) {
        List<int[]> res = new ArrayList<>();
        res.add(new int[]{});
        for (int n : nums) {
            int sz = res.size();
            for (int i = 0; i < sz; i++) {
                int[] prev = res.get(i);
                int[] next = new int[prev.length + 1];
                System.arraycopy(prev, 0, next, 0, prev.length);
                next[prev.length] = n;
                res.add(next);
            }
        }
        return res.toArray(new int[0][]);
    }
}`
  },
  'number-of-islands': {
    python: `from typing import List
class Solution:
    def numIslands(self, grid: List[List[int]]) -> int:
        if not grid: return 0
        rows, cols, count = len(grid), len(grid[0]), 0
        def dfs(r, c):
            if r < 0 or r >= rows or c < 0 or c >= cols or grid[r][c] != 1: return
            grid[r][c] = 0
            dfs(r+1,c); dfs(r-1,c); dfs(r,c+1); dfs(r,c-1)
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == 1:
                    dfs(r, c)
                    count += 1
        return count`,
    cpp: `#include <vector>
using namespace std;
class Solution {
public:
    int numIslands(vector<vector<int>>& grid) {
        int rows = grid.size(), cols = grid[0].size(), count = 0;
        for (int r = 0; r < rows; r++)
            for (int c = 0; c < cols; c++)
                if (grid[r][c] == 1) { dfs(grid, r, c); count++; }
        return count;
    }
    void dfs(vector<vector<int>>& g, int r, int c) {
        if (r<0||r>=(int)g.size()||c<0||c>=(int)g[0].size()||g[r][c]!=1) return;
        g[r][c] = 0;
        dfs(g,r+1,c); dfs(g,r-1,c); dfs(g,r,c+1); dfs(g,r,c-1);
    }
};`,
    java: `class Solution {
    public int numIslands(int[][] grid) {
        int count = 0;
        for (int r = 0; r < grid.length; r++)
            for (int c = 0; c < grid[0].length; c++)
                if (grid[r][c] == 1) { dfs(grid, r, c); count++; }
        return count;
    }
    void dfs(int[][] g, int r, int c) {
        if (r<0||r>=g.length||c<0||c>=g[0].length||g[r][c]!=1) return;
        g[r][c] = 0;
        dfs(g,r+1,c); dfs(g,r-1,c); dfs(g,r,c+1); dfs(g,r,c-1);
    }
}`
  },
  'clone-graph': {
    python: `from typing import Optional, List
class Solution:
    def cloneGraph(self, node: Optional['GraphNode']) -> Optional['GraphNode']:
        if not node: return None
        visited = {}
        def clone(n):
            if n in visited: return visited[n]
            c = GraphNode(n.val)
            visited[n] = c
            for nb in n.neighbors:
                c.neighbors.append(clone(nb))
            return c
        return clone(node)`,
    cpp: `#include <vector>
#include <unordered_map>
using namespace std;
class Solution {
    unordered_map<GraphNode*, GraphNode*> visited;
public:
    GraphNode* cloneGraph(GraphNode* node) {
        if (!node) return nullptr;
        if (visited.count(node)) return visited[node];
        GraphNode* c = new GraphNode(node->val);
        visited[node] = c;
        for (auto nb : node->neighbors) c->neighbors.push_back(cloneGraph(nb));
        return c;
    }
};`,
    java: `import java.util.*;
class Solution {
    Map<GraphNode, GraphNode> visited = new HashMap<>();
    public GraphNode cloneGraph(GraphNode node) {
        if (node == null) return null;
        if (visited.containsKey(node)) return visited.get(node);
        GraphNode c = new GraphNode(node.val);
        visited.put(node, c);
        for (GraphNode nb : node.neighbors) c.neighbors.add(cloneGraph(nb));
        return c;
    }
}`
  },
  'coin-change': {
    python: `from typing import List
class Solution:
    def coinChange(self, coins: List[int], amount: int) -> int:
        dp = [float('inf')] * (amount + 1)
        dp[0] = 0
        for i in range(1, amount + 1):
            for c in coins:
                if c <= i: dp[i] = min(dp[i], dp[i - c] + 1)
        return dp[amount] if dp[amount] != float('inf') else -1`,
    cpp: `#include <vector>
#include <algorithm>
using namespace std;
class Solution {
public:
    int coinChange(vector<int>& coins, int amount) {
        vector<int> dp(amount + 1, amount + 1);
        dp[0] = 0;
        for (int i = 1; i <= amount; i++)
            for (int c : coins)
                if (c <= i) dp[i] = min(dp[i], dp[i - c] + 1);
        return dp[amount] > amount ? -1 : dp[amount];
    }
};`,
    java: `import java.util.*;
class Solution {
    public int coinChange(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, amount + 1);
        dp[0] = 0;
        for (int i = 1; i <= amount; i++)
            for (int c : coins)
                if (c <= i) dp[i] = Math.min(dp[i], dp[i - c] + 1);
        return dp[amount] > amount ? -1 : dp[amount];
    }
}`
  }
}

// ─── Wrong solutions (return obviously incorrect results) ───

const WRONG_SOLUTIONS = {
  python: `from typing import List
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        return [0, 0]
    def groupAnagrams(self, strs: List[str]) -> List[List[str]]:
        return [strs]
    def isPalindrome(self, s: str) -> bool:
        return False
    def threeSum(self, nums: List[int]) -> List[List[int]]:
        return []
    def maxProfit(self, prices: List[int]) -> int:
        return -1
    def minWindow(self, s: str, t: str) -> str:
        return "wrong"
    def isValid(self, s: str) -> bool:
        return True
    def search(self, nums: List[int], target: int) -> int:
        return 999
    def minEatingSpeed(self, piles: List[int], h: int) -> int:
        return 999999
    def reverseList(self, head):
        return head
    def invertTree(self, root):
        return root
    def topKFrequent(self, nums: List[int], k: int) -> List[int]:
        return [0]
    def subsets(self, nums: List[int]) -> List[List[int]]:
        return [[]]
    def numIslands(self, grid: List[List[str]]) -> int:
        return 0
    def cloneGraph(self, node):
        return node
    def coinChange(self, coins: List[int], amount: int) -> int:
        return 0`,
  cpp: `#include <vector>
#include <string>
using namespace std;
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) { return {0,0}; }
    int maxProfit(vector<int>& prices) { return -1; }
    bool isValid(string s) { return true; }
    int search(vector<int>& nums, int target) { return 999; }
    int coinChange(vector<int>& coins, int amount) { return 0; }
};`,
  java: `import java.util.*;
class Solution {
    public int[] twoSum(int[] nums, int target) { return new int[]{0,0}; }
    public int maxProfit(int[] prices) { return -1; }
    public boolean isValid(String s) { return true; }
    public int search(int[] nums, int target) { return 999; }
    public int coinChange(int[] coins, int amount) { return 0; }
}`
}

// Simple problems to test wrong solutions against
const WRONG_TEST_PROBLEMS = ['two-sum', 'best-time-to-buy-and-sell-stock', 'valid-parentheses', 'binary-search', 'coin-change']

// ─── API helpers ───

async function apiPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`)
  return res.json()
}

async function pollJob(endpoint, jobId) {
  const start = Date.now()
  while (Date.now() - start < POLL_TIMEOUT) {
    const result = await apiGet(`${endpoint}?jobId=${jobId}`)
    if (result.ready || result.error) return result
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
  return { error: 'POLL_TIMEOUT' }
}

async function runTests(problemId, language, code) {
  const { jobId, error } = await apiPost('/api/run', { problemId, language, code, testCases: [] })
  if (error) return { error }
  // Run uses sample tests from metadata by default when testCases is empty.
  // Instead read the problem metadata and pass its testCases.
  return { skipped: true, reason: 'Use submit for hidden tests' }
}

async function submitCode(problemId, language, code) {
  const { jobId, error } = await apiPost('/api/submit', { problemId, language, code, startTcNo: 0 })
  if (error) return { error }
  return pollJob('/api/submit', jobId)
}

async function runSampleTests(problemId, language, code, testCases) {
  const { jobId, error } = await apiPost('/api/run', { problemId, language, code, testCases })
  if (error) return { error }
  return pollJob('/api/run', jobId)
}

// ─── Main ───

const args = process.argv.slice(2)
const filterProblem = args.includes('--problem') ? args[args.indexOf('--problem') + 1] : null
const filterLang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null
const csvPath = args.includes('--csv') ? args[args.indexOf('--csv') + 1] : null

const LANGUAGES = ['python', 'cpp', 'java']
const results = []

async function main() {
  console.log('=== M0.1 Judge Verification ===')
  console.log(`Server: ${BASE}`)
  console.log(`Filter: problem=${filterProblem || 'all'}, lang=${filterLang || 'all'}`)
  console.log()

  // Health check
  try {
    const res = await fetch(`${BASE}/`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    console.log('Server health: OK')
  } catch (e) {
    console.error(`Server not reachable at ${BASE}: ${e.message}`)
    process.exit(1)
  }

  const problems = Object.keys(SOLUTIONS)
  let passed = 0, failed = 0, errors = 0

  // Phase 1: Correct solutions against hidden tests (submit)
  console.log('\n--- Phase 1: Correct solutions (submit against hidden tests) ---\n')

  for (const slug of problems) {
    if (filterProblem && slug !== filterProblem) continue
    for (const lang of LANGUAGES) {
      if (filterLang && lang !== filterLang) continue
      const code = SOLUTIONS[slug]?.[lang]
      if (!code) { console.log(`  SKIP ${slug} ${lang} (no solution)`); continue }

      process.stdout.write(`  ${slug} ${lang} ... `)
      const start = Date.now()
      try {
        const result = await submitCode(slug, lang, code)
        const elapsed = ((Date.now() - start) / 1000).toFixed(1)

        if (result.error) {
          console.log(`ERROR (${elapsed}s): ${result.error.substring(0, 120)}`)
          results.push({ slug, lang, type: 'correct', verdict: 'ERROR', detail: result.error, elapsed })
          errors++
        } else if (result.timeout) {
          console.log(`TIMEOUT (${elapsed}s)`)
          results.push({ slug, lang, type: 'correct', verdict: 'TIMEOUT', detail: '', elapsed })
          failed++
        } else if (result.accepted || result.allAccepted) {
          const tc = result.totalTc || result.passedTc || '?'
          console.log(`ACCEPTED (${tc} tests, ${elapsed}s)`)
          results.push({ slug, lang, type: 'correct', verdict: 'ACCEPTED', detail: `${tc} tests`, elapsed })
          passed++
        } else {
          const failedTests = (result.results || []).filter(r => !r.isCorrect).length
          console.log(`REJECTED (${failedTests} failed, ${elapsed}s)`)
          const first = (result.results || []).find(r => !r.isCorrect)
          const detail = first ? `expected=${first.correctAnswer} got=${first.output}` : ''
          results.push({ slug, lang, type: 'correct', verdict: 'REJECTED', detail, elapsed })
          failed++
        }
      } catch (e) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1)
        console.log(`EXCEPTION (${elapsed}s): ${e.message}`)
        results.push({ slug, lang, type: 'correct', verdict: 'EXCEPTION', detail: e.message, elapsed })
        errors++
      }
    }
  }

  // Phase 2: Wrong solutions (should be rejected)
  console.log('\n--- Phase 2: Incorrect solutions (expect rejection) ---\n')

  for (const slug of WRONG_TEST_PROBLEMS) {
    if (filterProblem && slug !== filterProblem) continue
    for (const lang of LANGUAGES) {
      if (filterLang && lang !== filterLang) continue
      const code = WRONG_SOLUTIONS[lang]
      if (!code) continue

      process.stdout.write(`  ${slug} ${lang} (wrong) ... `)
      const start = Date.now()
      try {
        const result = await submitCode(slug, lang, code)
        const elapsed = ((Date.now() - start) / 1000).toFixed(1)

        if (result.error) {
          // Compilation or runtime error on wrong code is acceptable rejection
          console.log(`REJECTED-ERROR (${elapsed}s)`)
          results.push({ slug, lang, type: 'wrong', verdict: 'REJECTED', detail: 'error', elapsed })
          passed++
        } else if (result.timeout) {
          console.log(`REJECTED-TIMEOUT (${elapsed}s)`)
          results.push({ slug, lang, type: 'wrong', verdict: 'REJECTED', detail: 'timeout', elapsed })
          passed++
        } else if (result.accepted || result.allAccepted) {
          console.log(`BUG: ACCEPTED wrong solution! (${elapsed}s)`)
          results.push({ slug, lang, type: 'wrong', verdict: 'ACCEPTED-BUG', detail: 'wrong solution accepted', elapsed })
          failed++
        } else {
          console.log(`REJECTED (${elapsed}s)`)
          results.push({ slug, lang, type: 'wrong', verdict: 'REJECTED', detail: 'incorrect output', elapsed })
          passed++
        }
      } catch (e) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1)
        console.log(`EXCEPTION (${elapsed}s): ${e.message}`)
        results.push({ slug, lang, type: 'wrong', verdict: 'EXCEPTION', detail: e.message, elapsed })
        errors++
      }
    }
  }

  // Phase 3: Timeout test
  console.log('\n--- Phase 3: Timeout detection ---\n')
  if (!filterProblem || filterProblem === 'two-sum') {
    const timeoutCode = `from typing import List
import time
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        time.sleep(60)
        return [0, 1]`
    process.stdout.write('  two-sum python (timeout) ... ')
    const start = Date.now()
    try {
      const result = await submitCode('two-sum', 'python', timeoutCode)
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      if (result.timeout) {
        console.log(`TIMEOUT detected correctly (${elapsed}s)`)
        results.push({ slug: 'two-sum', lang: 'python', type: 'timeout', verdict: 'TIMEOUT-OK', detail: '', elapsed })
        passed++
      } else {
        console.log(`BUG: no timeout (${elapsed}s)`)
        results.push({ slug: 'two-sum', lang: 'python', type: 'timeout', verdict: 'TIMEOUT-MISS', detail: '', elapsed })
        failed++
      }
    } catch (e) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      console.log(`EXCEPTION (${elapsed}s): ${e.message}`)
      results.push({ slug: 'two-sum', lang: 'python', type: 'timeout', verdict: 'EXCEPTION', detail: e.message, elapsed })
      errors++
    }
  }

  // Phase 4: Compilation error test
  console.log('\n--- Phase 4: Compilation error detection ---\n')
  if (!filterLang || filterLang === 'cpp') {
    process.stdout.write('  two-sum cpp (compile error) ... ')
    const start = Date.now()
    try {
      const result = await submitCode('two-sum', 'cpp', 'this is not valid c++')
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      if (result.error) {
        console.log(`ERROR detected correctly (${elapsed}s)`)
        results.push({ slug: 'two-sum', lang: 'cpp', type: 'compile-error', verdict: 'ERROR-OK', detail: '', elapsed })
        passed++
      } else {
        console.log(`BUG: no error (${elapsed}s)`)
        results.push({ slug: 'two-sum', lang: 'cpp', type: 'compile-error', verdict: 'ERROR-MISS', detail: '', elapsed })
        failed++
      }
    } catch (e) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      console.log(`EXCEPTION (${elapsed}s): ${e.message}`)
      results.push({ slug: 'two-sum', lang: 'cpp', type: 'compile-error', verdict: 'EXCEPTION', detail: e.message, elapsed })
      errors++
    }
  }
  if (!filterLang || filterLang === 'java') {
    process.stdout.write('  two-sum java (compile error) ... ')
    const start = Date.now()
    try {
      const result = await submitCode('two-sum', 'java', 'this is not valid java')
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      if (result.error) {
        console.log(`ERROR detected correctly (${elapsed}s)`)
        results.push({ slug: 'two-sum', lang: 'java', type: 'compile-error', verdict: 'ERROR-OK', detail: '', elapsed })
        passed++
      } else {
        console.log(`BUG: no error (${elapsed}s)`)
        results.push({ slug: 'two-sum', lang: 'java', type: 'compile-error', verdict: 'ERROR-MISS', detail: '', elapsed })
        failed++
      }
    } catch (e) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      console.log(`EXCEPTION (${elapsed}s): ${e.message}`)
      results.push({ slug: 'two-sum', lang: 'java', type: 'compile-error', verdict: 'EXCEPTION', detail: e.message, elapsed })
      errors++
    }
  }

  // Summary
  console.log('\n=== Summary ===')
  console.log(`Total: ${results.length} tests`)
  console.log(`Passed: ${passed}`)
  console.log(`Failed: ${failed}`)
  console.log(`Errors: ${errors}`)

  if (failed > 0) {
    console.log('\nFailed tests:')
    for (const r of results) {
      if (r.verdict.includes('BUG') || (r.type === 'correct' && r.verdict !== 'ACCEPTED')) {
        console.log(`  ${r.slug} ${r.lang} [${r.type}]: ${r.verdict} — ${r.detail}`)
      }
    }
  }

  // Write CSV
  const csvOut = csvPath || 'docs/feasibility/runtime-test-matrix.csv'
  const header = 'slug,language,test_type,verdict,detail,elapsed_seconds'
  const rows = results.map(r =>
    `${r.slug},${r.lang},${r.type},${r.verdict},"${(r.detail||'').replace(/"/g,'""')}",${r.elapsed}`
  )
  const { writeFileSync } = await import('node:fs')
  writeFileSync(csvOut, header + '\n' + rows.join('\n') + '\n')
  console.log(`\nResults written to ${csvOut}`)

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(2) })
