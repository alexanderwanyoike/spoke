import { useState } from "react";
import type { SpokeApp } from "../data";
import type { Contact } from "../follow";
import { useSpokeTimeline } from "../feed";
import { Screen } from "../shared/Screen";
import type { ProfileRepository } from "../profile";
import type { HomeGateway } from "./gateway";
import { useHomeData } from "./use-home-data";
import { Composer } from "./Composer";
import { FeedList } from "./FeedList";
import { createPostPublisher } from "./publisher";
import type { PostInput, PostPhoto } from "./input";

type HomeProps = {
  identity: string;
  contacts: Contact[];
  gateway: HomeGateway;
  profiles: ProfileRepository;
};
export function HomePage(props: HomeProps) {
  const { state, retry } = useHomeData(props.gateway);
  if (state.kind === "ready") return <ConnectedHome {...props} data={state.data} />;
  return (
    <Screen title="Home" description="A little of your world, and the people in it.">
      {state.kind === "loading" && <p role="status">Connecting your feed…</p>}
      {state.kind === "error" && (
        <div role="alert" className="page-notice">
          {state.error}
          <button onClick={retry}>Retry</button>
        </div>
      )}
    </Screen>
  );
}
function ConnectedHome({
  identity,
  contacts,
  gateway,
  profiles,
  data
}: HomeProps & { data: SpokeApp }) {
  const [composing, setComposing] = useState(false);
  const timeline = useSpokeTimeline(data, { localIdentity: identity, contacts });
  async function publish(input: PostInput, photos: PostPhoto[]) {
    const own = await profiles.load(identity);
    await createPostPublisher(data, identity, gateway.images).publish(
      input,
      photos,
      own.profile?.displayName || identity
    );
    void timeline.refresh().catch(() => undefined);
  }
  return (
    <Screen title="Home" description="A little of your world, and the people in it.">
      <button className="compose-entry" onClick={() => setComposing(true)}>
        <span>What would you like to share?</span>
        <strong>New post</strong>
      </button>
      {composing && <Composer onPublish={publish} onClose={() => setComposing(false)} />}
      <div className="feed-heading">
        <h2>Latest from your people</h2>
        <button
          disabled={timeline.refreshing}
          onClick={() => void timeline.refresh().catch(() => undefined)}
        >
          Refresh feed
        </button>
      </div>
      <FeedList
        snapshot={timeline.snapshot}
        images={gateway.images}
        onRetry={() => void timeline.refresh().catch(() => undefined)}
      />
    </Screen>
  );
}
