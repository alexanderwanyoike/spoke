// Public surface of the message feature. Consumers import from "./message" (or
// "@/message"); the internal split (model / commands / loaders / queries) stays
// private behind this barrel.

export * from "./model";
export { sendMessage, acceptReceivedMessage } from "./commands";
export { loadConversations } from "./loaders";
export { selectConversations, readConversations, useConversations } from "./queries";
