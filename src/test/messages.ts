import { vi } from "vitest";
import type { MessagesGateway } from "../message/gateway";
import type { ConversationView, MessagesData } from "../message/view-model";

export function conversation(recipient = "bob", name = "Bob"): ConversationView {
  return {
    id: `conv_alice_${recipient}`,
    recipient,
    name,
    canSend: true,
    participants: ["alice", recipient],
    messages: [],
    lastMessageAt: "",
    preview: "Start a conversation"
  };
}
export function gatewayFixture(conversations = [conversation(), conversation("carol", "Carol")]) {
  const data: MessagesData = {
    contacts: conversations
      .filter((item) => item.canSend)
      .map((item) => ({
        identity: item.recipient,
        displayName: item.name,
        relationship: "accepted"
      })),
    conversations,
    pendingCount: 0,
    contactRequests: [],
    requestedContacts: []
  };
  return {
    data,
    gateway: {
      load: vi.fn<MessagesGateway["load"]>().mockResolvedValue(data),
      send: vi.fn<MessagesGateway["send"]>().mockResolvedValue(undefined),
      loadImage: vi.fn<MessagesGateway["loadImage"]>().mockResolvedValue(new Blob(["image"])),
      contacts: {
        request: vi.fn().mockResolvedValue(undefined),
        decide: vi.fn().mockResolvedValue(undefined)
      },
      confirmed: new Set<string>()
    }
  };
}
