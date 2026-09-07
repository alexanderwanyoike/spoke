import { SubscriptionState } from "jolt-sdk/data";
import type { FeedTimelineSnapshot } from "../feed";
import type { PublicImages } from "../media/public";
import { PostCard } from "./PostCard";
export function FeedList({
  snapshot,
  images,
  onRetry
}: {
  snapshot: FeedTimelineSnapshot;
  images: PublicImages;
  onRetry(): void;
}) {
  const loading =
    snapshot.state === SubscriptionState.Loading || snapshot.state === SubscriptionState.Updating;
  const unavailable =
    snapshot.state === SubscriptionState.Stale ||
    snapshot.state === SubscriptionState.Unavailable ||
    snapshot.state === SubscriptionState.Revoked;
  return (
    <>
      {unavailable && (
        <div className="page-notice" role="status">
          Some posts could not be refreshed. Previously loaded posts remain here.
          <button onClick={onRetry}>Retry feed</button>
        </div>
      )}
      {loading && snapshot.items.length === 0 && <p role="status">Loading posts…</p>}
      {!loading && !unavailable && snapshot.items.length === 0 && (
        <div className="feature-empty">
          <h3>A little space for everyday things.</h3>
          <p>Share your first post, or add someone in People to see what they share.</p>
        </div>
      )}
      <div className="feed-list">
        {snapshot.items.map((item) => (
          <PostCard key={item.address} item={item} images={images} />
        ))}
      </div>
    </>
  );
}
