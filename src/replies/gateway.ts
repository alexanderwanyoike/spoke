import { createJoltSdk } from "../jolt";
import type { HomeGateway } from "../home";
import { openPost } from "../home/post-document";
import { ReplyRepository } from "./repository";
import { ReplyService } from "./service";

export function createRepliesGateway(identity: string, token: string, home: HomeGateway) {
  const sdk = createJoltSdk(() => token);
  const repository = new ReplyRepository(sdk);
  const service = new ReplyService(identity, sdk, repository, async (owner, postId) => {
    const post = await openPost(await home.connect(), identity, owner, postId);
    return post.kind === "ready";
  });
  return { repository, service, inbox: service.inbox };
}
export type RepliesGateway = ReturnType<typeof createRepliesGateway>;
