import { useState, useSyncExternalStore } from "react";
import type { RepliesGateway } from "./gateway";
import type { ReplyDraft } from "./service";
import { useReplyThread } from "./use-reply-thread";
import { ReplyForm } from "./ReplyForm";
import { ReplyTree } from "./ReplyTree";
import { ReplyRequestCard } from "./ReplyRequestCard";
export function RepliesPanel({
  identity,
  owner,
  postId,
  gateway,
  getDisplayName = async () => identity
}: {
  identity: string;
  owner: string;
  postId: string;
  gateway: RepliesGateway;
  getDisplayName?(): Promise<string>;
}) {
  const state = useReplyThread(gateway.repository, identity, owner, postId);
  const inbox = useSyncExternalStore(gateway.inbox.subscribe, gateway.inbox.getSnapshot);
  const [parent, setParent] = useState({ id: postId, name: "the post" });
  const [version, resetForm] = useState(0);
  const [notice, setNotice] = useState("");
  async function submit(draft: ReplyDraft) {
    const result = await gateway.service.submit({ ...draft, displayName: await getDisplayName() });
    setNotice(result === "published" ? "Reply published." : "Reply submitted to the post author.");
    setParent({ id: postId, name: "the post" });
    resetForm((value) => value + 1);
    state.refresh();
  }
  async function decide(id: string, decision: "accepted" | "rejected") {
    await gateway.inbox.decide(id, decision);
    state.refresh();
  }
  return (
    <section className="replies-panel" aria-label="Public replies">
      <div className="feed-heading">
        <h2>Conversation</h2>
        <button onClick={state.refresh}>Refresh replies</button>
      </div>
      {state.error && (
        <p className="page-notice" role="alert">
          {state.error}
        </p>
      )}
      {!state.thread && !state.error && <p role="status">Loading replies…</p>}
      {state.thread?.unavailable ? (
        <p className="page-notice">Some replies could not be opened.</p>
      ) : null}
      {state.thread?.roots.length === 0 && (
        <p className="quiet-copy">Be the first to add a thought.</p>
      )}
      {state.thread && <ReplyTree nodes={state.thread.roots} onReply={setParent} />}
      {inbox.requests
        .filter((item) => item.reply.postId === postId && item.reply.postAuthor === owner)
        .map((item) => (
          <ReplyRequestCard key={item.ingressId} item={item} onDecide={decide} />
        ))}
      {state.submitted.length > 0 && (
        <details className="submitted-replies">
          <summary>Your replies outside this conversation ({state.submitted.length})</summary>
          <p>These public replies are not included in the author's conversation.</p>
          {state.submitted.map((reply) => (
            <p key={reply.id}>{reply.body}</p>
          ))}
        </details>
      )}
      {notice && <p role="status">{notice}</p>}
      <ReplyForm
        key={`${parent.id}:${version}`}
        owner={owner}
        postId={postId}
        parent={parent}
        onSubmit={submit}
        onCancel={() => setParent({ id: postId, name: "the post" })}
      />
    </section>
  );
}
