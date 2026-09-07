import type { ReplyRepository } from "../replies/repository";
import type { ActivityRepository } from "./repository";
export function createActivityGateway(
  identity: string,
  saved: ActivityRepository,
  replies: ReplyRepository
) {
  return {
    async load() {
      const [privateActivity, publicActivity] = await Promise.all([
        saved.load(),
        replies.accepted(identity)
      ]);
      return {
        saved: privateActivity,
        replies: publicActivity.replies,
        unavailable: publicActivity.unavailable
      };
    },
    markRead: (ids: string[]) => saved.markRead(ids)
  };
}
export type ActivityGateway = ReturnType<typeof createActivityGateway>;
