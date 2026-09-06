import type { Store } from "../common/store";
import {
  hasAcceptedContactForIdentity,
  normalizeIdentity,
  readContacts,
  sameIdentity
} from "../follow";
import type { JoltEncryptedSdk, JoltIngressSdk } from "../jolt";
import { acceptReceivedMessage } from "./commands";
import {
  decodeMessage,
  makeReceivedPath,
  messageBelongsToConversation,
  messageTargetsIdentity
} from "./model";

type ReceiveSdk = Pick<JoltEncryptedSdk, "publishEncryptedJson"> &
  Pick<JoltIngressSdk, "listPendingIngress" | "openIngress" | "acceptIngress">;

export async function receiveMessages(
  sdk: ReceiveSdk,
  identity: string,
  store: Store,
  signal?: AbortSignal
) {
  signal?.throwIfAborted();
  const records = await sdk.listPendingIngress();
  const contacts = readContacts(identity, store);
  let pendingCount = 0;
  for (const record of records) {
    signal?.throwIfAborted();
    const supported =
      record.schema_hint === "spoke.message.v1" || record.schema_hint === "spoke.message.v2";
    if (!supported || !hasAcceptedContactForIdentity(contacts, record.sender_identity)) {
      pendingCount++;
      continue;
    }
    const message = decodeMessage(await sdk.openIngress(record.ingress_id));
    const valid =
      message &&
      sameIdentity(message.sender, record.sender_identity) &&
      sameIdentity(record.recipient_identity, identity) &&
      messageTargetsIdentity(message, identity) &&
      messageBelongsToConversation(message);
    if (!valid) {
      pendingCount++;
      continue;
    }
    signal?.throwIfAborted();
    const stored = store.get({
      identity: normalizeIdentity(identity),
      path: makeReceivedPath(message.id)
    });
    if (stored && JSON.stringify(stored.value) !== JSON.stringify(message)) {
      throw new Error("A received message conflicts with an existing message ID.");
    }
    if (!stored) await acceptReceivedMessage(sdk, identity, message, store);
    signal?.throwIfAborted();
    await sdk.acceptIngress(record.ingress_id);
  }
  return pendingCount;
}
