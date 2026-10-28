#include <string>
#include <sstream>
using namespace std;
class Codec {
public:
    string serialize(TreeNode* root) {
        if (!root) return "null";
        return to_string(root->val) + "," + serialize(root->left) + "," + serialize(root->right);
    }
    TreeNode* deserialize(string data) {
        istringstream ss(data);
        return build(ss);
    }
private:
    TreeNode* build(istringstream& ss) {
        string val;
        getline(ss, val, ',');
        if (val == "null") return nullptr;
        TreeNode* node = new TreeNode(stoi(val));
        node->left = build(ss);
        node->right = build(ss);
        return node;
    }
};
