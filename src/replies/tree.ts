import type { Reply } from "./contracts";
export type ReplyNode = { reply: Reply; children: ReplyNode[] };
export type ReplyThread = { roots: ReplyNode[]; replies: Reply[]; unavailable: number };

export function assembleThread(postId: string, replies: Reply[], unavailable = 0): ReplyThread {
  const nodes = new Map(replies.map((reply) => [reply.id, { reply, children: [] as ReplyNode[] }]));
  const roots: ReplyNode[] = [];
  const visible: Reply[] = [];
  for (const node of nodes.values()) {
    if (!reachesPost(node.reply, postId, nodes)) {
      unavailable++;
      continue;
    }
    visible.push(node.reply);
    if (node.reply.parent === postId) roots.push(node);
    else nodes.get(node.reply.parent)!.children.push(node);
  }
  const compare = (a: ReplyNode, b: ReplyNode) =>
    a.reply.createdAt.localeCompare(b.reply.createdAt) || a.reply.id.localeCompare(b.reply.id);
  roots.sort(compare);
  for (const node of nodes.values()) node.children.sort(compare);
  return { roots, replies: visible, unavailable };
}
function reachesPost(reply: Reply, postId: string, nodes: Map<string, ReplyNode>) {
  const visited = new Set([reply.id]);
  let parent = reply.parent;
  while (parent !== postId) {
    if (visited.has(parent)) return false;
    visited.add(parent);
    const ancestor = nodes.get(parent);
    if (!ancestor) return false;
    parent = ancestor.reply.parent;
  }
  return true;
}
