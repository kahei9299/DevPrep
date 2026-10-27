class Solution {
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
}
