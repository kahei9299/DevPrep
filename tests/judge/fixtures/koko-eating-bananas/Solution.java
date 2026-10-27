class Solution {
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
}
