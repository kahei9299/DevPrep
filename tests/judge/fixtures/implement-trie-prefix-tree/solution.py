class Trie:
    def __init__(self):
        self.children = {}
        self.end = False
    def insert(self, word: str) -> None:
        node = self
        for c in word:
            if c not in node.children: node.children[c] = Trie()
            node = node.children[c]
        node.end = True
    def search(self, word: str) -> bool:
        node = self
        for c in word:
            if c not in node.children: return False
            node = node.children[c]
        return node.end
    def startsWith(self, prefix: str) -> bool:
        node = self
        for c in prefix:
            if c not in node.children: return False
            node = node.children[c]
        return True
