class Solution {
    public int maxProfit(int[] prices) {
        int mn = Integer.MAX_VALUE, mx = 0;
        for (int p : prices) { mn = Math.min(mn, p); mx = Math.max(mx, p - mn); }
        return mx;
    }
}
