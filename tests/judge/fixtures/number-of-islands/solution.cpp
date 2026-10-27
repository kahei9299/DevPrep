#include <vector>
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
};
