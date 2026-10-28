import java.util.*;
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
}
