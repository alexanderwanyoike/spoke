import { Dialog } from "radix-ui";
import { Plus, X } from "lucide-react";
import type { Contact } from "../follow";
import type { ContactInput, ContactRequest } from "./contracts";
import { ContactForm } from "./ContactForm";
import { ContactRequestCard } from "./ContactRequestCard";

type Props = {
  requests: ContactRequest[];
  requestedContacts: Contact[];
  onRequest(input: ContactInput): Promise<void>;
  onDecide(id: string, decision: "accepted" | "rejected"): Promise<void>;
};
export function ContactDialog({ requests, requestedContacts, onRequest, onDecide }: Props) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="new-conversation">
        <Plus size={16} />
        New conversation
        {requests.length > 0 && <span className="request-count">{requests.length} requests</span>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="contact-overlay" />
        <Dialog.Content className="contact-dialog">
          <Dialog.Close className="icon-button dialog-close" aria-label="Close contacts">
            <X size={18} />
          </Dialog.Close>
          <Dialog.Title>Connect with someone</Dialog.Title>
          <Dialog.Description>
            Send a private contact request. Once accepted, you can exchange messages and images.
          </Dialog.Description>
          <ContactForm onRequest={onRequest} />
          {requests.length > 0 && (
            <section aria-label="Incoming contact requests">
              <h3>Incoming requests</h3>
              {requests.map((item) => (
                <ContactRequestCard key={item.ingressId} item={item} onDecide={onDecide} />
              ))}
            </section>
          )}
          {requestedContacts.length > 0 && (
            <section aria-label="Sent contact requests">
              <h3>Waiting for acceptance</h3>
              {requestedContacts.map((contact) => (
                <p className="contact-request" key={contact.identity}>
                  {contact.displayName}
                  <small>{contact.identity}</small>
                </p>
              ))}
            </section>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
