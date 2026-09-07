import type { SpokeApp } from "../data";
import { useSpokeTimeline } from "../feed";
import type { HomeGateway } from "./gateway";
import { useHomeData } from "./use-home-data";
import { FeedList } from "./FeedList";
export function ProfilePosts({ identity, gateway }: { identity: string; gateway: HomeGateway }) {
  const { state, retry } = useHomeData(gateway);
  return (
    <section className="profile-posts">
      <h2>Posts</h2>
      {state.kind === "loading" && <p role="status">Loading posts…</p>}
      {state.kind === "error" && (
        <div role="status">
          {state.error}
          <button onClick={retry}>Retry posts</button>
        </div>
      )}
      {state.kind === "ready" && (
        <PublishedPosts identity={identity} data={state.data} gateway={gateway} />
      )}
    </section>
  );
}
function PublishedPosts({
  identity,
  data,
  gateway
}: {
  identity: string;
  data: SpokeApp;
  gateway: HomeGateway;
}) {
  const timeline = useSpokeTimeline(data, { localIdentity: identity, contacts: [] });
  return (
    <FeedList
      snapshot={timeline.snapshot}
      images={gateway.images}
      onRetry={() => void timeline.refresh().catch(() => undefined)}
    />
  );
}
