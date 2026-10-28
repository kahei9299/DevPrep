import java.util.*;
class Solution {
    public int[] runLruCache(String[] operations, int[][] args) {
        List<Integer> res = new ArrayList<>();
        int cap = args[0][0];
        LinkedHashMap<Integer,Integer> map = new LinkedHashMap<>(16, 0.75f, true);
        for (int i = 1; i < operations.length; i++) {
            if ("get".equals(operations[i])) {
                Integer v = map.get(args[i][0]);
                res.add(v == null ? -1 : v);
            } else if ("put".equals(operations[i])) {
                map.put(args[i][0], args[i][1]);
                if (map.size() > cap) {
                    Iterator<Map.Entry<Integer,Integer>> it = map.entrySet().iterator();
                    it.next(); it.remove();
                }
            }
        }
        return res.stream().mapToInt(Integer::intValue).toArray();
    }
}
