import { useSyncExternalStore } from "react";
import { useMessagesServices, useMessagesSnapshot } from "../message";
import { ActivityPage } from "../activity/ActivityPage";
import { activityItems } from "../activity/model";
import { useActivity } from "../activity/use-activity";
import type { ActivityGateway } from "../activity/gateway";
import type { RepliesGateway } from "../replies/gateway";
export function ActivityRoute({
  identity,
  gateway,
  replies
}: {
  identity: string;
  gateway: ActivityGateway;
  replies: RepliesGateway;
}) {
  const messages = useMessagesSnapshot();
  const { resource, decideContact } = useMessagesServices();
  const inbox = useSyncExternalStore(replies.inbox.subscribe, replies.inbox.getSnapshot);
  const activity = useActivity(gateway);
  const items = activityItems(
    identity,
    messages.data.conversations,
    messages.data.contacts,
    activity.data.replies,
    activity.data.saved
  );
  async function refresh() {
    await resource.refresh();
    activity.refresh();
  }
  async function decideReply(id: string, decision: "accepted" | "rejected") {
    await replies.inbox.decide(id, decision);
    await refresh();
  }
  const partial = activity.data.unavailable + inbox.unavailable;
  const error =
    messages.error ||
    activity.error ||
    (partial > 0 ? "Some activity could not be opened. Refresh to try again." : "");
  return (
    <ActivityPage
      items={items}
      requests={messages.data.contactRequests}
      replyRequests={inbox.requests}
      loading={activity.loading || messages.status === "loading"}
      error={error}
      onRefresh={() => void refresh()}
      onRead={activity.markRead}
      onContactDecision={decideContact}
      onReplyDecision={decideReply}
    />
  );
}
