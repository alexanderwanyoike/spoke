// Public surface of the thread feature. Consumers import from "./thread"; the
// internal split (model / policy / enumeration / commands / loaders / queries)
// stays private behind this barrel.

export * from "./model";
export { acceptanceDecision, type AcceptanceDecision } from "./policy";
export { createThreadBridge, type ThreadEnumeration } from "./enumeration";
export { submitReply, acceptReply, unacceptReply } from "./commands";
export { loadThread } from "./loaders";
export { selectThread, readThread, useThread, type ThreadScope } from "./queries";
