from typing import Optional, List
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
        return clone(node)
