import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { Screen } from "../shared/Screen";
import type { HomeGateway } from "./gateway";
import { type ReadyPost } from "./post-document";
import { PostCard } from "./PostCard";
import { PostEditor } from "./PostEditor";
import { DeletePost } from "./DeletePost";
import { usePostDocument } from "./use-post-document";

type Props = { identity: string; gateway: HomeGateway; children?: (post: ReadyPost) => ReactNode };
export function PostPage(props: Props) {
  const { identity: owner = "", postId = "" } = useParams();
  return <PostScreen key={`${owner}:${postId}`} {...props} owner={owner} postId={postId} />;
}
function PostScreen({
  identity,
  gateway,
  owner,
  postId,
  children
}: Props & { owner: string; postId: string }) {
  const state = usePostDocument(gateway, identity, owner, postId);
  const { document, error, undo, retry, restore } = state;
  const [editing, setEditing] = useState(false);
  function saved(next: ReadyPost) {
    state.saved(next);
    setEditing(false);
  }
  return (
    <Screen
      title="Conversation"
      description="A public post and the replies around it."
      actions={
        <Link className="text-action" to="/home">
          Back to Home
        </Link>
      }
    >
      {error && (
        <div className="page-notice" role="alert">
          {error}
          <button onClick={retry}>Retry</button>
        </div>
      )}
      {!document && !error && <p role="status">Loading post…</p>}
      {document?.kind === "unavailable" && (
        <div className="feature-empty">
          <h2>This post is not available.</h2>
          <p>Its author may be offline, or the post may no longer be accessible.</p>
          <button onClick={retry}>Try again</button>
        </div>
      )}
      {document?.kind === "deleted" && (
        <div className="feature-empty">
          <h2>Post deleted</h2>
          {undo && <button onClick={() => void restore()}>Undo deletion</button>}
        </div>
      )}
      {document?.kind === "ready" && (
        <>
          {editing ? (
            <PostEditor document={document} onSaved={saved} onCancel={() => setEditing(false)} />
          ) : (
            <PostCard item={document.item} images={gateway.images} showLink={false} />
          )}
          {document.actions && !editing && (
            <div className="post-owner-actions">
              <button onClick={() => setEditing(true)}>Edit post</button>
              <DeletePost actions={document.actions} onDeleted={state.deleted} />
            </div>
          )}
          {!editing && children?.(document)}
        </>
      )}
    </Screen>
  );
}
