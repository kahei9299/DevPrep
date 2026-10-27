#include <string>
using namespace std;
class Trie {
    Trie* ch[26] = {};
    bool isEnd = false;
public:
    Trie() {}
    void insert(string word) {
        Trie* n = this;
        for (char c : word) {
            if (!n->ch[c-'a']) n->ch[c-'a'] = new Trie();
            n = n->ch[c-'a'];
        }
        n->isEnd = true;
    }
    bool search(string word) {
        Trie* n = this;
        for (char c : word) {
            if (!n->ch[c-'a']) return false;
            n = n->ch[c-'a'];
        }
        return n->isEnd;
    }
    bool startsWith(string prefix) {
        Trie* n = this;
        for (char c : prefix) {
            if (!n->ch[c-'a']) return false;
            n = n->ch[c-'a'];
        }
        return true;
    }
};
