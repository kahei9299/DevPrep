import java.util.*;
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
}
