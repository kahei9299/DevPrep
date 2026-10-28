import java.util.*;
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
}
