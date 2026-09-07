import type { ContactRequest } from "../contacts";
import { sameIdentity, type Contact } from "../follow";
import {
  conversationIdForParticipants,
  messagePreview,
  type Conversation,
  type ConversationsById
} from "./model";

export type ConversationView = Conversation & {
  recipient: string;
  name: string;
  preview: string;
  canSend: boolean;
};
export type MessagesData = {
  contacts: Contact[];
  conversations: ConversationView[];
  pendingCount: number;
  contactRequests: ContactRequest[];
  requestedContacts: Contact[];
  unavailableCount?: number;
};

export function conversationViews(
  identity: string,
  contacts: Contact[],
  conversations: ConversationsById
): ConversationView[] {
  const result = new Map<string, ConversationView>();
  for (const conversation of Object.values(conversations)) {
    const recipient = conversation.participants.find((person) => !sameIdentity(person, identity));
    if (!recipient) continue;
    const contact = contacts.find((person) => sameIdentity(person.identity, recipient));
    const last = conversation.messages[conversation.messages.length - 1];
    result.set(conversation.id, {
      ...conversation,
      recipient,
      name: contact?.displayName || recipient,
      canSend: contact?.relationship === "accepted",
      preview: last ? messagePreview(last.message) : "Start a conversation"
    });
  }
  for (const contact of contacts) {
    if (contact.relationship !== "accepted" || sameIdentity(identity, contact.identity)) continue;
    const id = conversationIdForParticipants([identity, contact.identity]);
    if (result.has(id)) continue;
    result.set(id, {
      id,
      recipient: contact.identity,
      name: contact.displayName || contact.identity,
      canSend: true,
      participants: [identity, contact.identity],
      messages: [],
      lastMessageAt: "",
      preview: "Start a conversation"
    });
  }
  return [...result.values()].sort(
    (a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt) || a.name.localeCompare(b.name)
  );
}
