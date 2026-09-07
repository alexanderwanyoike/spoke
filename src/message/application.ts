import { createStore } from "../common/store";
import {
  normalizeIdentity,
  contactNickname,
  displayNameForContact,
  type Contact,
  type SpokeFollowResponse
} from "../follow";
import { createProfileNames } from "../profile";
import { ContactRepository, ContactService } from "../contacts";
import type { JoltEncryptedSdk, JoltIngressSdk, JoltSdk } from "../jolt";
import { loadConversations } from "./loaders";
import { readConversations } from "./queries";
import { conversationViews, type MessagesData } from "./view-model";
import { createMessageSender } from "./send-workflow";
import { receiveMessages } from "./receive";
import type { MessageMedia } from "./media-repository";
import type { MessagesGateway } from "./gateway";

type MessagingSdk = JoltEncryptedSdk & JoltIngressSdk & Pick<JoltSdk, "read">;
export type SessionEffects = {
  reviewInbox?(contacts: Contact[], signal?: AbortSignal): Promise<number | void>;
  contactAccepted?(response: SpokeFollowResponse): Promise<void>;
};

/** One identity's private projection and use cases. The SDK remains the data authority. */
export function createMessagesApplication(
  identity: string,
  sdk: MessagingSdk,
  media: MessageMedia,
  effects: SessionEffects = {}
): MessagesGateway {
  const store = createStore();
  const profileNames = createProfileNames(sdk);
  const contacts = new ContactRepository(sdk, identity, store);
  const contactService = new ContactService(sdk, identity, store, effects.contactAccepted);
  const sender = createMessageSender({
    identity,
    sdk,
    store,
    authorize: (recipient) => contacts.requireAccepted(recipient),
    upload: media.upload
  });

  async function load(signal?: AbortSignal) {
    signal?.throwIfAborted();
    const inventory = await contacts.refresh();
    const requests = await contactService.review(signal);
    const reviewedRequests = await effects.reviewInbox?.(contacts.all(), signal);
    const pendingCount = await receiveMessages(sdk, identity, store, signal);
    const { unavailableCount } = await loadConversations(
      { ...sdk, listPublished: async () => inventory },
      identity,
      store
    );
    return {
      conversations: conversationViews(
        identity,
        contacts.all(),
        readConversations(identity, store)
      ),
      contacts: contacts.all(),
      contactRequests: requests,
      requestedContacts: contacts.all().filter((contact) => contact.relationship === "requested"),
      pendingCount: Math.max(0, pendingCount - requests.length - (reviewedRequests || 0)),
      unavailableCount
    };
  }

  async function resolveNames(data: MessagesData): Promise<MessagesData> {
    const participants = data.conversations.map((item) => ({
      identity: item.recipient,
      displayName: item.name
    }));
    const unnamed = [...data.contacts, ...participants].filter(
      (person) => !contactNickname(person)
    );
    const names = await profileNames.load(unnamed.map((person) => person.identity));
    const nameFor = (person: Contact) =>
      displayNameForContact(person, names.get(normalizeIdentity(person.identity)));
    const contacts = data.contacts.map((person) => ({ ...person, displayName: nameFor(person) }));
    return {
      ...data,
      contacts,
      requestedContacts: contacts.filter((person) => person.relationship === "requested"),
      conversations: data.conversations.map((item) => ({
        ...item,
        name: nameFor({ identity: item.recipient, displayName: item.name })
      }))
    };
  }

  return { ...sender, contacts: contactService, load, resolveNames, loadImage: media.load };
}
