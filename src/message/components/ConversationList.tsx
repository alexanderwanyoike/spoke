import { ContactDialog } from "../../contacts";
import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Search, RefreshCw } from "lucide-react";
import { useMessagesServices, useMessagesSnapshot } from "../context";
import { ProfileAvatar } from "../../profile";

export function ConversationList() {
  const snapshot = useMessagesSnapshot();
  const { resource, requestContact, decideContact } = useMessagesServices();
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const conversations = snapshot.data.conversations.filter((item) =>
    `${item.name} ${item.recipient}`.toLocaleLowerCase().includes(query)
  );
  return (
    <aside className="conversation-list" aria-label="Conversations">
      <header>
        <div>
          <span className="eyebrow">YOUR PEOPLE</span>
          <h1>Messages</h1>
        </div>
        <button
          className="icon-button"
          aria-label="Refresh conversations"
          disabled={snapshot.refreshing}
          onClick={() => void resource.refresh()}
        >
          <RefreshCw size={17} />
        </button>
      </header>
      <ContactDialog
        requests={snapshot.data.contactRequests}
        requestedContacts={snapshot.data.requestedContacts}
        onRequest={requestContact}
        onDecide={decideContact}
      />
      <label className="conversation-search">
        <Search size={17} />
        <input
          aria-label="Find a conversation"
          placeholder="Find a conversation"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className="conversation-rows">
        {snapshot.status === "loading" && (
          <p className="list-note" role="status">
            Loading your conversations…
          </p>
        )}
        {snapshot.status === "unavailable" && (
          <p className="list-note">
            Conversations could not be loaded. Try refreshing when Jolt is available.
          </p>
        )}
        {conversations.map((item) => (
          <NavLink
            key={item.id}
            to={`/messages/${encodeURIComponent(item.id)}`}
            className="conversation-row"
          >
            <ProfileAvatar identity={item.recipient} name={item.name} />
            <span className="conversation-summary">
              <strong>{item.name}</strong>
              <span>{item.preview}</span>
            </span>
            {item.lastMessageAt && (
              <time dateTime={item.lastMessageAt}>
                {new Date(item.lastMessageAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric"
                })}
              </time>
            )}
          </NavLink>
        ))}
        {snapshot.status === "ready" && conversations.length === 0 && (
          <p className="list-note">
            {query
              ? "No conversations match your search."
              : "Conversations with accepted contacts appear here. Your contact list is currently empty."}
          </p>
        )}
      </div>
      <footer>
        <span className="privacy-dot" /> Encrypted conversations
      </footer>
    </aside>
  );
}
