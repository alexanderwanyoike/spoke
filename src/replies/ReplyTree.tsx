import { Link } from "react-router-dom";
import type { ReplyNode } from "./tree";
function rows(nodes: ReplyNode[]) {
  const result: { node: ReplyNode; depth: number }[] = [];
  const pending = nodes.map((node) => ({ node, depth: 0 })).reverse();
  while (pending.length) {
    const row = pending.pop()!;
    result.push(row);
    pending.push(...row.node.children.map((node) => ({ node, depth: row.depth + 1 })).reverse());
  }
  return result;
}
export function ReplyTree({
  nodes,
  onReply
}: {
  nodes: ReplyNode[];
  onReply(parent: { id: string; name: string }): void;
}) {
  return (
    <ol className="reply-tree">
      {rows(nodes).map(({ node: { reply }, depth }) => {
        const name = reply.displayName || reply.sender;
        return (
          <li
            key={reply.id}
            id={`reply-${reply.id}`}
            style={{ marginInlineStart: `${Math.min(depth, 4) * 16}px` }}
          >
            <article className="reply-card">
              <header>
                <Link to={`/profile/${encodeURIComponent(reply.sender)}`}>{name}</Link>
                <time dateTime={reply.createdAt}>
                  {new Date(reply.createdAt).toLocaleDateString()}
                </time>
              </header>
              {depth > 0 && (
                <a
                  className="reply-parent"
                  href={`#reply-${reply.parent}`}
                  onClick={(event) => {
                    event.preventDefault();
                    document
                      .getElementById(`reply-${reply.parent}`)
                      ?.scrollIntoView({ block: "center" });
                  }}
                >
                  In reply to an earlier comment
                </a>
              )}
              <p>{reply.body}</p>
              <button
                className="text-action"
                aria-label={`Reply to ${name}`}
                onClick={() => onReply({ id: reply.id, name })}
              >
                Reply
              </button>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
