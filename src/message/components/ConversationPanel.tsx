import { Link } from "react-router-dom";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import type { ConversationView } from "../view-model";
import { useMessagesServices } from "../context";
import { Avatar } from "./Avatar";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";

export function ConversationPanel({ conversation }: { conversation: ConversationView }) {
  const { drafts, send } = useMessagesServices();
  return (
    <section className="conversation-panel" aria-label={`Conversation with ${conversation.name}`}>
      <header className="thread-header">
        <Link
          className="icon-button conversation-back"
          to="/messages"
          aria-label="Back to conversations"
        >
          <ArrowLeft size={20} />
        </Link>
        <Avatar name={conversation.name} />
        <div>
          <h2>{conversation.name}</h2>
          <p>{conversation.recipient}</p>
        </div>
        <span className="thread-privacy">
          <LockKeyhole size={14} /> Private conversation
        </span>
      </header>
      <MessageList messages={conversation.messages} />
      {conversation.canSend && (
        <MessageComposer
          recipient={conversation.recipient}
          name={conversation.name}
          drafts={drafts}
          send={send}
        />
      )}
      {!conversation.canSend && (
        <div className="read-only-note">
          This person is no longer an accepted contact. You can still read your conversation.
        </div>
      )}
    </section>
  );
}
