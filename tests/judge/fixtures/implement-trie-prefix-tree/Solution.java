class Trie {
    Trie[] ch = new Trie[26];
    boolean isEnd;
    public Trie() {}
    public void insert(String word) {
        Trie n = this;
        for (char c : word.toCharArray()) {
            if (n.ch[c-'a'] == null) n.ch[c-'a'] = new Trie();
            n = n.ch[c-'a'];
        }
        n.isEnd = true;
    }
    public boolean search(String word) {
        Trie n = this;
        for (char c : word.toCharArray()) {
            if (n.ch[c-'a'] == null) return false;
            n = n.ch[c-'a'];
        }
        return n.isEnd;
    }
    public boolean startsWith(String prefix) {
        Trie n = this;
        for (char c : prefix.toCharArray()) {
            if (n.ch[c-'a'] == null) return false;
            n = n.ch[c-'a'];
        }
        return true;
    }
}
