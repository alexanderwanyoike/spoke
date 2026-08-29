// Public surface of the feed feature. Components depend on Spoke-facing hooks
// and models; legacy Append compatibility and timeline mechanics stay behind
// this barrel.

export * from "./model";
export { createJoltEnumeration, type EnumerationSource, type PostRef } from "./enumeration";
export { publishPost } from "./commands";
export { loadFeed } from "./loaders";
export { selectFeed, readFeed, useFeed, type FeedScope } from "./queries";
export {
  createFeedTimeline,
  type FeedTimeline,
  type FeedTimelineSnapshot,
  type FeedTimelineSourceSnapshot,
} from "./timeline";
export { useSpokeTimeline, type SpokeTimeline } from "./use-spoke-timeline";
