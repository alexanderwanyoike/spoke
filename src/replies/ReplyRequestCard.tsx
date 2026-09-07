import { useState } from "react";
import { Link } from "react-router-dom";
import { apiErrorMessage } from "../jolt";
import type { ReplyReview } from "./contracts";
export function ReplyRequestCard({
  item,
  onDecide
}: {
  item: ReplyReview;
  onDecide(id: string, decision: "accepted" | "rejected"): Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const name = item.reply.displayName || item.reply.sender;
  async function decide(decision: "accepted" | "rejected") {
    setPending(true);
    setError("");
    try {
      await onDecide(item.ingressId, decision);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <article className="reply-request">
      <header>
        <strong>{name}</strong>
        <span>would like to join your conversation</span>
      </header>
      <p>{item.reply.body}</p>
      <Link
        className="text-action"
        to={`/post/${encodeURIComponent(item.reply.postAuthor)}/${encodeURIComponent(item.reply.postId)}`}
      >
        View post
      </Link>
      {error && <p role="alert">{error}</p>}
      <div className="contact-actions">
        <button disabled={pending} onClick={() => void decide("rejected")}>
          Decline reply
        </button>
        <button
          className="primary-button"
          disabled={pending}
          onClick={() => void decide("accepted")}
        >
          Include reply
        </button>
      </div>
    </article>
  );
}
