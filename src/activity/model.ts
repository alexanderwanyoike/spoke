import { sameIdentity, type Contact } from "../follow";
import { messagePreview } from "../message/model";
import type { ConversationView } from "../message/view-model";
import type { Reply } from "../replies/contracts";
import type { SavedActivity } from "./repository";
export type ActivityItem = {
  id: string;
  kind: "message" | "reply" | "contact";
  name: string;
  description: string;
  preview: string;
  createdAt: string;
  route: string;
  unread: boolean;
};
type Event = Omit<ActivityItem, "unread">;

export function activityItems(
  identity: string,
  conversations: ConversationView[],
  contacts: Contact[],
  replies: Reply[],
  saved: SavedActivity
): ActivityItem[] {
  function nameFor(actor: string, fallback = actor) {
    return (
      contacts.find((contact) => sameIdentity(contact.identity, actor))?.displayName || fallback
    );
  }
  const messages: Event[] = conversations.flatMap((conversation) =>
    conversation.messages
      .filter((item) => item.direction === "received")
      .map(({ message }) => ({
        id: `message/${message.id}`,
        kind: "message",
        name: conversation.name,
        description: "sent you a message",
        preview: messagePreview(message),
        createdAt: message.createdAt,
        route: `/messages/${encodeURIComponent(conversation.id)}`
      }))
  );
  const publicReplies: Event[] = replies
    .filter((reply) => !sameIdentity(reply.sender, identity))
    .map((reply) => ({
      id: `reply/${reply.postId}/${reply.id}`,
      kind: "reply",
      name: nameFor(reply.sender, reply.displayName || reply.sender),
      description: "replied to your post",
      preview: reply.body,
      createdAt: reply.createdAt,
      route: `/post/${encodeURIComponent(reply.postAuthor)}/${encodeURIComponent(reply.postId)}`
    }));
  const accepted: Event[] = saved.contacts.map((event) => ({
    id: event.id,
    kind: "contact",
    name: nameFor(event.actor),
    description: "accepted your contact request",
    preview: "You can now send each other messages.",
    createdAt: event.createdAt,
    route: `/profile/${encodeURIComponent(event.actor)}`
  }));
  return [
    ...new Map(
      [...messages, ...publicReplies, ...accepted].map((event) => [event.id, event])
    ).values()
  ]
    .map((event) => ({ ...event, unread: !saved.read.has(event.id) }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
