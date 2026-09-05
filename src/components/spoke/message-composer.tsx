// The compose box owns its draft. Keeping the draft in App state re-rendered
// the whole app on every keystroke, message list and images included, which
// showed up as typing lag once a conversation had any history.

import { useState, type KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import type { Contact } from "@/feed";

type MessageComposerProps = {
  contact: Contact;
  initialValue: string;
  onDraftChange: (identity: string, value: string) => void;
  // Resolves true when the message was sent, so the box can clear itself.
  onSend: (contact: Contact, body: string) => Promise<boolean>;
};

export function MessageComposer({ contact, initialValue, onDraftChange, onSend }: MessageComposerProps) {
  const [draft, setDraft] = useState(initialValue);

  async function send() {
    if (await onSend(contact, draft)) {
      setDraft("");
      onDraftChange(contact.identity, "");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void send();
  }

  return (
    <Textarea
      className="min-h-16"
      rows={2}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        onDraftChange(contact.identity, event.target.value);
      }}
      onKeyDown={handleKeyDown}
      placeholder={`Message ${contact.displayName}`}
    />
  );
}
