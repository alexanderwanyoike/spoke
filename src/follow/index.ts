// Public surface of the follow / contacts feature. Consumers import from
// "./follow" (or "@/follow"); the internal split (model / commands / loaders /
// queries) stays private behind this barrel.

export * from "./model";
export {
  publishContact,
  addContact,
  requestFollow,
  sendFollowResponse,
  acceptFollowRequest,
  applyIncomingResponse,
  removeContact
} from "./commands";
export { loadContacts } from "./loaders";
export { selectContacts, readContacts, useContacts } from "./queries";
