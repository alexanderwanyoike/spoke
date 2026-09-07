import type { JoltSdk, JoltAppendSdk, EnumeratedRecord } from "../jolt";
import { sameIdentity } from "../follow";
import { makeReplyPath, makeAcceptedPrefix, makeAcceptedRefPath } from "../thread/model";
import { Acceptance, Reply, decoder } from "./contracts";
import { assembleThread } from "./tree";

type ReplySdk = Pick<JoltSdk, "readContent"> & JoltAppendSdk;
export class ReplyRepository {
  constructor(private sdk: ReplySdk) {}

  async publish(reply: Reply) {
    Reply.parse(reply);
    const path = makeReplyPath(reply.postId, reply.id);
    const existing = await this.read(reply.sender, reply.postId, reply.id);
    if (existing) {
      if (JSON.stringify(existing.value) !== JSON.stringify(Reply.parse(reply)))
        throw new Error(
          "This reply was already published with different text. Open the conversation before trying again."
        );
      return existing;
    }
    return this.sdk.publishAppend(path, reply);
  }

  async read(sender: string, postId: string, replyId: string) {
    const path = makeReplyPath(postId, replyId);
    const records = (await this.sdk.enumerate(sender, path)).filter(
      (record) => record.path === path
    );
    if (new Set(records.map((record) => record.contentId)).size > 1)
      throw new Error("This reply has conflicting publications.");
    const record = records[0];
    if (!record) return null;
    const hit = await this.sdk.readContent(
      record.contentId,
      { identity: sender, path },
      record.deviceSequence,
      decoder(Reply)
    );
    if (
      !hit ||
      hit.value.id !== replyId ||
      hit.value.postId !== postId ||
      !sameIdentity(hit.value.sender, sender)
    )
      return null;
    return hit;
  }

  async accept(owner: string, reply: Reply) {
    if (!sameIdentity(owner, reply.postAuthor))
      throw new Error("Only the post author can accept this reply.");
    const hit = await this.read(reply.sender, reply.postId, reply.id);
    if (!hit || JSON.stringify(hit.value) !== JSON.stringify(Reply.parse(reply)))
      throw new Error("The published reply could not be verified.");
    const path = makeAcceptedRefPath(reply.postId, reply.id);
    const records = await this.sdk.enumerate(owner, path);
    const record = records.find((record) => record.path === path);
    const current =
      record &&
      (await this.sdk.readContent(
        record.contentId,
        { identity: owner, path },
        record.deviceSequence,
        decoder(Acceptance)
      ));
    if (current) {
      if (current.value.contentId !== hit.contentId)
        throw new Error("This reply ID is already in the conversation.");
      return;
    }
    await this.sdk.publishAppend(path, {
      schema: "spoke.accepted_reply.v2",
      postId: reply.postId,
      replyId: reply.id,
      replyRef: hit.ref,
      contentId: hit.contentId,
      acceptedAt: new Date().toISOString()
    } satisfies Acceptance);
  }

  async submitted(identity: string, owner: string, postId: string) {
    const records = await this.sdk.enumerate(identity, `/spoke/replies/${postId}/`);
    const replies: Reply[] = [];
    for (const record of records) {
      const hit = await this.sdk.readContent(
        record.contentId,
        { identity, path: record.path },
        record.deviceSequence,
        decoder(Reply)
      );
      if (
        hit &&
        sameIdentity(hit.value.sender, identity) &&
        sameIdentity(hit.value.postAuthor, owner) &&
        hit.value.postId === postId &&
        record.path === makeReplyPath(postId, hit.value.id)
      )
        replies.push(hit.value);
    }
    return replies;
  }

  async load(owner: string, postId: string) {
    const entries = await this.accepted(owner, makeAcceptedPrefix(postId));
    const replies = entries.replies.filter((reply) => reply.postId === postId);
    return assembleThread(postId, replies, entries.unavailable);
  }

  async accepted(owner: string, prefix = "/spoke/accepted/") {
    const records = await this.sdk.enumerate(owner, prefix);
    const replies = new Map<string, Reply>();
    let unavailable = 0;
    for (const record of records) {
      try {
        const reply = await this.readAccepted(owner, record);
        if (reply) replies.set(`${reply.postId}/${reply.id}`, reply);
        else unavailable++;
      } catch {
        unavailable++;
      }
    }
    return { replies: [...replies.values()], unavailable };
  }

  private async readAccepted(owner: string, record: EnumeratedRecord) {
    const hit = await this.sdk.readContent(
      record.contentId,
      { identity: owner, path: record.path },
      record.deviceSequence,
      decoder(Acceptance)
    );
    if (!hit || record.path !== makeAcceptedRefPath(hit.value.postId, hit.value.replyId))
      return null;
    const accepted = hit.value;
    if (accepted.replyRef.path !== makeReplyPath(accepted.postId, accepted.replyId)) return null;
    const publications = await this.sdk.enumerate(
      accepted.replyRef.identity,
      accepted.replyRef.path
    );
    const verified = publications.some(
      (publication) =>
        publication.path === accepted.replyRef.path && publication.contentId === accepted.contentId
    );
    if (!verified) return null;
    const published = await this.sdk.readContent(
      accepted.contentId,
      accepted.replyRef,
      0,
      decoder(Reply)
    );
    return published && matchesAcceptance(published.value, accepted, owner)
      ? published.value
      : null;
  }
}

function matchesAcceptance(reply: Reply, accepted: Acceptance, owner: string) {
  return (
    reply.id === accepted.replyId &&
    reply.postId === accepted.postId &&
    sameIdentity(reply.postAuthor, owner) &&
    sameIdentity(reply.sender, accepted.replyRef.identity)
  );
}
