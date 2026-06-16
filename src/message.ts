import { sameIdentity } from "./follow";
import type { SpokeMessageAttachment } from "./media";

export type SpokeMessage = {
  schema: "spoke.message.v1" | "spoke.message.v2";
  id: string;
  conversationId: string;
  sender: string;
  recipients: string[];
  body: string;
  createdAt: string;
  attachments?: SpokeMessageAttachment[];
};

export type MessageDirection = "sent" | "received";

export type ConversationMessage = {
  message: SpokeMessage;
  direction: MessageDirection;
};

export type Conversation = {
  id: string;
  participants: string[];
  messages: ConversationMessage[];
  lastMessageAt: string;
};

export type ConversationsById = Record<string, Conversation>;

export function normalizeConversationParticipant(identity: string) {
  return identity.trim().replace(/\.jolt$/, "");
}

export function conversationIdForParticipants(participants: string[]) {
  const normalized = [...new Set(participants.map(normalizeConversationParticipant).filter(Boolean))]
    .sort();
  if (normalized.length !== 2) {
    throw new Error("A one-to-one conversation needs exactly two participants.");
  }
  return `conv_${normalized.join("_")}`;
}

export function messageBelongsToConversation(message: SpokeMessage) {
  try {
    return message.conversationId === conversationIdForParticipants([
      message.sender,
      ...message.recipients
    ]);
  } catch {
    return false;
  }
}

export function isSpokeMessage(value: unknown): value is SpokeMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const schema = (value as { schema?: unknown }).schema;
  return schema === "spoke.message.v1" || schema === "spoke.message.v2";
}

export function sortConversationMessages(messages: ConversationMessage[]) {
  return [...messages].sort((a, b) => {
    const byTime = a.message.createdAt.localeCompare(b.message.createdAt);
    return byTime === 0 ? a.message.id.localeCompare(b.message.id) : byTime;
  });
}

export function upsertConversationMessage(
  current: ConversationsById,
  message: SpokeMessage,
  direction: MessageDirection
): ConversationsById {
  const existing = current[message.conversationId];
  const messages = sortConversationMessages([
    ...(existing?.messages || []).filter((item) => item.message.id !== message.id),
    { message, direction }
  ]);
  const participants = existing?.participants || [message.sender, ...message.recipients];
  const lastMessageAt = messages[messages.length - 1]?.message.createdAt || message.createdAt;

  return {
    ...current,
    [message.conversationId]: {
      id: message.conversationId,
      participants,
      messages,
      lastMessageAt
    }
  };
}

export function conversationsFromMessages(messages: ConversationMessage[]) {
  return messages.reduce<ConversationsById>(
    (current, item) => upsertConversationMessage(current, item.message, item.direction),
    {}
  );
}

export function otherParticipants(conversation: Conversation, localIdentity: string) {
  return conversation.participants.filter((participant) => !sameIdentity(participant, localIdentity));
}
