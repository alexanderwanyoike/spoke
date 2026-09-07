import { createStore } from "../common/store";
import type { Contact } from "../follow";
import { ContactRepository, ContactService } from "../contacts";
import type { JoltEncryptedSdk, JoltIngressSdk } from "../jolt";
import { loadConversations } from "./loaders";
import { readConversations } from "./queries";
import { conversationViews } from "./view-model";
import { createMessageSender } from "./send-workflow";
import { receiveMessages } from "./receive";
import type { MessageMedia } from "./media-repository";
import type { MessagesGateway } from "./gateway";

type MessagingSdk = JoltEncryptedSdk & JoltIngressSdk;

/** One identity's private projection and use cases. The SDK remains the data authority. */
export function createMessagesApplication(
  identity: string,
  sdk: MessagingSdk,
  media: MessageMedia,
  reviewAdditionalInbox: (
    contacts: Contact[],
    signal?: AbortSignal
  ) => Promise<void> = async () => {}
): MessagesGateway {
  const store = createStore();
  const contacts = new ContactRepository(sdk, identity, store);
  const contactService = new ContactService(sdk, identity, store);
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
    await reviewAdditionalInbox(contacts.all(), signal);
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
      pendingCount: Math.max(0, pendingCount - requests.length),
      unavailableCount
    };
  }

  return { ...sender, contacts: contactService, load, loadImage: media.load };
}
