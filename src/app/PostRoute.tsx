import { PostPage, type HomeGateway } from "../home";
import type { ProfileRepository } from "../profile";
import { RepliesPanel } from "../replies/RepliesPanel";
import type { RepliesGateway } from "../replies/gateway";
export function PostRoute({
  identity,
  home,
  replies,
  profiles
}: {
  identity: string;
  home: HomeGateway;
  replies: RepliesGateway;
  profiles: ProfileRepository;
}) {
  async function getDisplayName() {
    return (await profiles.load(identity)).profile?.displayName || identity;
  }
  return (
    <PostPage identity={identity} gateway={home}>
      {(post) => (
        <RepliesPanel
          key={`${post.item.post.author}:${post.item.post.id}`}
          identity={identity}
          owner={post.item.post.author}
          postId={post.item.post.id}
          gateway={replies}
          getDisplayName={getDisplayName}
        />
      )}
    </PostPage>
  );
}
