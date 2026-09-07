import { useParams } from "react-router-dom";
import { MessagesSquare } from "lucide-react";
import { useMessagesSnapshot, useMessagesServices } from "./context";
import { ConversationList } from "./components/ConversationList";
import { ConversationPanel } from "./components/ConversationPanel";

export function MessagesPage() {
  const { conversationId } = useParams();
  const snapshot = useMessagesSnapshot();
  const { resource } = useMessagesServices();
  const conversation = snapshot.data.conversations.find((item) => item.id === conversationId);
  const freshness =
    snapshot.updatedAt === null
      ? "Try again when Jolt is available."
      : "Showing the last available conversation.";
  return (
    <main className="messages-page">
      {snapshot.error && (
        <div className="refresh-notice" role="status">
          <span>
            {snapshot.error} Your drafts are kept here. {freshness}
          </span>
          <button disabled={snapshot.refreshing} onClick={() => void resource.refresh()}>
            Retry
          </button>
        </div>
      )}
      {snapshot.data.pendingCount > 0 && (
        <div className="pending-notice" role="status">
          {snapshot.data.pendingCount} incoming item(s) could not be verified as contact requests or
          messages from accepted contacts.
        </div>
      )}
      {Boolean(snapshot.data.unavailableCount) && (
        <div className="pending-notice" role="status">
          {snapshot.data.unavailableCount} saved{" "}
          {snapshot.data.unavailableCount === 1 ? "message" : "messages"} could not be opened.
        </div>
      )}
      <div className="messages-layout" data-thread-open={Boolean(conversation)}>
        <ConversationList />
        {conversation && <ConversationPanel key={conversation.id} conversation={conversation} />}
        {!conversation && (
          <section className="no-conversation">
            <MessagesSquare size={38} strokeWidth={1.25} />
            <h2>A space for your people.</h2>
            <p>Choose a conversation, or send a contact request to someone new.</p>
            {conversationId && <p>This conversation is not available in the current list.</p>}
          </section>
        )}
      </div>
    </main>
  );
}
