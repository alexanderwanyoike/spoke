// Public surface of the feed feature. Consumers import from "./feed" (or
// "@/feed"); the internal split (model / enumeration / commands / loaders /
// queries) stays private behind this barrel.

export * from "./model";
export { createBridgeEnumeration, type EnumerationSource, type PostRef } from "./enumeration";
export { publishPost } from "./commands";
export { loadFeed } from "./loaders";
export { selectFeed, readFeed, useFeed, type FeedScope } from "./queries";
