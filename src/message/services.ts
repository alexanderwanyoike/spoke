import { createDrafts, type MessageDraft } from "./drafts";
import type { MessagesGateway } from "./gateway";
import { createMessagesResource } from "./resource";

export function createServices(gateway: MessagesGateway) {
  const resource = createMessagesResource(gateway.load);
  let lifetime = new AbortController();
  return {
    start() {
      lifetime = new AbortController();
      resource.start();
    },
    stop() {
      lifetime.abort();
      resource.stop();
    },
    gateway,
    resource,
    drafts: createDrafts(),
    async send(recipient: string, draft: MessageDraft) {
      const signal = lifetime.signal;
      await gateway.send(recipient, draft, signal);
      signal.throwIfAborted();
      await resource.refresh();
    }
  };
}
