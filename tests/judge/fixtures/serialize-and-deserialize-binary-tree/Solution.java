import java.util.*;
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
}
