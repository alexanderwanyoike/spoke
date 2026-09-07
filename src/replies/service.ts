import type { JoltIngressSdk } from "../jolt";
import { sameIdentity } from "../follow";
import { Reply, ReplyRequest } from "./contracts";
import { ReplyRepository } from "./repository";
import { ReplyInbox } from "./inbox";
export type ReplyDraft = Omit<Reply, "schema" | "sender">;

export class ReplyService {
  readonly inbox: ReplyInbox;
  constructor(
    private identity: string,
    private sdk: JoltIngressSdk,
    private repository: ReplyRepository,
    private postExists: (owner: string, id: string) => Promise<boolean>
  ) {
    this.inbox = new ReplyInbox(identity, sdk, repository, (reply) =>
      this.requireVisibleParent(reply)
    );
  }

  async submit(draft: ReplyDraft) {
    const reply = Reply.parse({ ...draft, schema: "spoke.reply.v2", sender: this.identity });
    await this.requireVisibleParent(reply);
    await this.repository.publish(reply);
    if (sameIdentity(this.identity, reply.postAuthor)) {
      await this.repository.accept(this.identity, reply);
      return "published" as const;
    }
    await this.sdk.sendObject(reply.postAuthor, `/spoke/outgoing/reply-${reply.id}`, {
      schema: "spoke.reply_request.v1",
      sender: this.identity,
      recipient: reply.postAuthor,
      replyId: reply.id,
      postId: reply.postId
    } satisfies ReplyRequest);
    return "submitted" as const;
  }

  private async requireVisibleParent(reply: Reply) {
    if (!(await this.postExists(reply.postAuthor, reply.postId)))
      throw new Error("This post is no longer available for replies.");
    if (reply.parent === reply.postId) return;
    const thread = await this.repository.load(reply.postAuthor, reply.postId);
    if (!thread.replies.some((parent) => parent.id === reply.parent))
      throw new Error("The parent reply is not available. Refresh the conversation first.");
  }
}
