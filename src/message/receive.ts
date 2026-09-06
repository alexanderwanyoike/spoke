import type { Store } from "../common/store";
import {
  hasAcceptedContactForIdentity,
  normalizeIdentity,
  readContacts,
  sameIdentity
} from "../follow";
import type { IngressRecord, JoltEncryptedSdk, JoltIngressSdk } from "../jolt";
import { acceptReceivedMessage } from "./commands";
import {
  decodeMessage,
  makeReceivedPath,
  messageBelongsToConversation,
  messageTargetsIdentity,
  type SpokeMessage
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
    if (!hasAcceptedContactForIdentity(contacts, record.sender_identity)) {
      pendingCount++;
      continue;
    }
    const message = decodeMessage(await sdk.openIngress(record.ingress_id));
    if (!message || !isAuthenticMessage(message, record, identity)) {
      pendingCount++;
      continue;
    }
    signal?.throwIfAborted();
    await persistReceivedMessage(sdk, identity, message, store);
    signal?.throwIfAborted();
    await sdk.acceptIngress(record.ingress_id);
  }
  return pendingCount;
}

function isAuthenticMessage(message: SpokeMessage, record: IngressRecord, identity: string) {
  return (
    sameIdentity(message.sender, record.sender_identity) &&
    sameIdentity(record.recipient_identity, identity) &&
    messageTargetsIdentity(message, identity) &&
    messageBelongsToConversation(message)
  );
}

async function persistReceivedMessage(
  sdk: ReceiveSdk,
  identity: string,
  message: SpokeMessage,
  store: Store
) {
  const stored = store.get({
    identity: normalizeIdentity(identity),
    path: makeReceivedPath(message.id)
  });
  if (stored && JSON.stringify(stored.value) !== JSON.stringify(message)) {
    throw new Error("A received message conflicts with an existing message ID.");
  }
  if (!stored) await acceptReceivedMessage(sdk, identity, message, store);
}
