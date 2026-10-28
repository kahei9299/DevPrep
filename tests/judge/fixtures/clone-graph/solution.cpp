#include <vector>
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
};
