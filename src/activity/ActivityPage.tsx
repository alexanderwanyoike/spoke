import { useState } from "react";
import { Bell } from "lucide-react";
import { Screen } from "../shared/Screen";
import { apiErrorMessage } from "../jolt";
import type { ContactRequest } from "../contacts";
import { ContactRequestCard } from "../contacts/ContactRequestCard";
import { ReplyRequestCard } from "../replies/ReplyRequestCard";
import type { ReplyReview } from "../replies/contracts";
import type { ActivityItem } from "./model";
import { ActivityList } from "./ActivityList";
const filters = ["All", "Unread", "Replies", "Messages", "Contacts", "Requests"] as const;
type Filter = (typeof filters)[number];
const kinds = { Replies: "reply", Messages: "message", Contacts: "contact" };
function matches(item: ActivityItem, filter: Filter) {
  if (filter === "All") return true;
  if (filter === "Unread") return item.unread;
  if (filter === "Requests") return false;
  return item.kind === kinds[filter];
}
type Props = {
  items: ActivityItem[];
  requests: ContactRequest[];
  replyRequests: ReplyReview[];
  loading: boolean;
  error: string;
  onRefresh(): void;
  onRead(ids: string[]): Promise<void>;
  onContactDecision(id: string, decision: "accepted" | "rejected"): Promise<void>;
  onReplyDecision(id: string, decision: "accepted" | "rejected"): Promise<void>;
};
export function ActivityPage(props: Props) {
  const [filter, setFilter] = useState<Filter>("All");
  const [limit, setLimit] = useState(30);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const items = props.items.filter((item) => matches(item, filter));
  const unread = props.items.filter((item) => item.unread);
  const contacts = filter === "Messages" || filter === "Replies" ? [] : props.requests;
  const replies = filter === "Messages" || filter === "Contacts" ? [] : props.replyRequests;
  async function markRead(ids: string[]) {
    setPending(true);
    setError("");
    try {
      await props.onRead(ids);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <Screen
      title="Activity"
      description="Replies and requests worth coming back to."
      actions={<button onClick={props.onRefresh}>Refresh activity</button>}
    >
      <div className="activity-toolbar">
        <div className="activity-filters" aria-label="Filter activity">
          {filters.map((value) => (
            <button
              key={value}
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
                setLimit(30);
              }}
            >
              {value}
            </button>
          ))}
        </div>
        {unread.length > 0 && (
          <button
            className="text-action"
            disabled={pending}
            onClick={() => void markRead(unread.map((item) => item.id))}
          >
            Mark all read
          </button>
        )}
      </div>
      {(error || props.error) && (
        <p className="page-notice" role="alert">
          {error || props.error}
        </p>
      )}
      {props.loading && <p role="status">Loading activity…</p>}
      {contacts.length + replies.length > 0 && (
        <section className="activity-requests" aria-label="Needs your attention">
          <h2>Needs your attention</h2>
          {contacts.map((item) => (
            <ContactRequestCard
              key={item.ingressId}
              item={item}
              onDecide={props.onContactDecision}
            />
          ))}
          {replies.map((item) => (
            <ReplyRequestCard key={item.ingressId} item={item} onDecide={props.onReplyDecision} />
          ))}
        </section>
      )}
      {!props.loading && !props.error && items.length + contacts.length + replies.length === 0 && (
        <div className="feature-empty">
          <Bell size={28} strokeWidth={1.5} />
          <h2>You're all caught up.</h2>
          <p>New replies, messages and contact requests will appear here.</p>
        </div>
      )}
      <ActivityList
        items={items.slice(0, limit)}
        pending={pending}
        onRead={(ids) => void markRead(ids)}
      />
      {items.length > limit && (
        <button onClick={() => setLimit((value) => value + 30)}>Show earlier activity</button>
      )}
    </Screen>
  );
}
