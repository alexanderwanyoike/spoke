import type { Store } from "../common/store";
import { hasAcceptedContactForIdentity, loadContacts, readContacts, sameIdentity } from "../follow";
import type { JoltEncryptedSdk } from "../jolt";
import { ContactRecord } from "./contracts";

export class ContactRepository {
  constructor(
    private sdk: JoltEncryptedSdk,
    private identity: string,
    private store: Store
  ) {}
  all() {
    return readContacts(this.identity, this.store);
  }

  async refresh() {
    // Listing failures must remain visible; an outage is not an empty address book.
    const inventory = await this.sdk.listPublished();
    await loadContacts(
      {
        listPublished: async () => inventory,
        readEncrypted: (ref, decode) =>
          this.sdk.readEncrypted(ref, (value) => {
            const parsed = ContactRecord.safeParse(value);
            return parsed.success ? decode(parsed.data) : null;
          })
      },
      this.identity,
      this.store
    );
    return inventory;
  }

  async requireNewContact(recipient: string) {
    await this.refresh();
    const existing = this.all().find((contact) => sameIdentity(contact.identity, recipient));
    if (existing?.relationship === "accepted" || existing?.relationship === "requested") {
      throw new Error("This contact is already connected or waiting for acceptance.");
    }
  }

  async requireAccepted(recipient: string) {
    await this.refresh();
    if (
      sameIdentity(this.identity, recipient) ||
      !hasAcceptedContactForIdentity(this.all(), recipient)
    ) {
      throw new Error("You can send messages only to accepted contacts.");
    }
  }
}
