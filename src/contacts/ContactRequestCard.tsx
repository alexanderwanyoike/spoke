import { useState } from "react";
import { apiErrorMessage } from "../jolt";
import type { ContactRequest } from "./contracts";

type Decision = "accepted" | "rejected";
export function ContactRequestCard({
  item,
  onDecide
}: {
  item: ContactRequest;
  onDecide(id: string, decision: Decision): Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const name = item.request.displayName || item.request.sender;
  async function decide(decision: Decision) {
    if (pending) return;
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
    <article className="contact-request">
      <strong>{name}</strong>
      <small>{item.request.sender}</small>
      {item.request.message && <p>{item.request.message}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="contact-actions">
        <button
          disabled={pending}
          onClick={() => void decide("rejected")}
          aria-label={`Decline ${name}`}
        >
          Decline
        </button>
        <button
          className="primary-button"
          disabled={pending}
          onClick={() => void decide("accepted")}
          aria-label={`Accept ${name}`}
        >
          Accept
        </button>
      </div>
    </article>
  );
}
