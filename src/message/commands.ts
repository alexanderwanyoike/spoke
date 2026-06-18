// Commands: the write half of the message seam.
// - sendMessage: the sender ingress-sends the message to the recipient and keeps
//   an encrypted outgoing copy, folded into the store as a "sent" message.
// - acceptReceivedMessage: the recipient persists a received copy in their own
//   namespace, folded into the store as a "received" message.
// Attachments are resolved by the caller (media layer) before the message is
// built; this seam only moves the message object.

import type { JoltInboxSdk, JoltSdk } from "../jolt";
import { normalizeIdentity } from "../follow";
import { store as defaultStore, type Store } from "../common/store";
import { makeOutgoingPath, makeReceivedPath, messageBelongsToConversation, type SpokeMessage } from "./model";

function foldMessage(
  store: Store,
  ownerIdentity: string,
  path: string,
  message: SpokeMessage,
  latestSequence: number
) {
  store.upsert({
    identity: normalizeIdentity(ownerIdentity),
    path,
    latestSequence,
    contentId: `message_${message.id}`,
    value: message
  });
}

export async function sendMessage(
  sdk: JoltInboxSdk,
  message: SpokeMessage,
  store: Store = defaultStore
): Promise<SpokeMessage> {
  if (!messageBelongsToConversation(message)) {
    throw new Error("Message participants do not match its conversation.");
  }
  const path = makeOutgoingPath(message.id);
  const published = await sdk.sendObject(message.recipients[0], path, message);
  const existing = store.get({ identity: normalizeIdentity(message.sender), path });
  const latestSequence = Math.max(published.latestSequence, (existing?.latestSequence ?? -1) + 1);
  foldMessage(store, message.sender, path, message, latestSequence);
  return message;
}

export async function acceptReceivedMessage(
  sdk: JoltSdk,
  localIdentity: string,
  message: SpokeMessage,
  store: Store = defaultStore
): Promise<SpokeMessage> {
  const path = makeReceivedPath(message.id);
  const published = await sdk.publishJson(path, message);
  const existing = store.get({ identity: normalizeIdentity(localIdentity), path });
  const latestSequence = Math.max(published.latestSequence, (existing?.latestSequence ?? -1) + 1);
  foldMessage(store, localIdentity, path, message, latestSequence);
  return message;
}
