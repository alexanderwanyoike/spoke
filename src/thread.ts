import {
  makeThreadPath,
  type PublishResponse,
  type SpokeAnyReply,
  type SpokeReply,
  type SpokeThreadIndex,
  type SpokeThreadManifest,
  type SpokeThreadReply
} from "./api";

export type RepliesByPost = Record<string, SpokeReply[]>;
export type ThreadRepliesByPost = Record<string, SpokeThreadReply[]>;

export type ThreadTreeNode = {
  reply: SpokeThreadReply;
  children: ThreadTreeNode[];
};

export function threadReplyPath(reply: Pick<SpokeThreadReply, "postId" | "id">) {
  return `/spoke/replies/${reply.postId}/${reply.id}`;
}

export function threadReplyReference(reply: Pick<SpokeThreadReply, "author" | "postId" | "id">) {
  return `${reply.author}:${threadReplyPath(reply)}`;
}

export function createThreadReply(input: Omit<SpokeThreadReply, "schema">): SpokeThreadReply {
  return {
    schema: "spoke.reply.v2",
    ...input
  };
}

export function createThreadManifest(input: {
  postId: string;
  owner: string;
  createdAt: string;
}): SpokeThreadManifest {
  return {
    schema: "spoke.thread.v2",
    postId: input.postId,
    owner: input.owner,
    participants: [{ identity: input.owner, addedAt: input.createdAt }],
    replies: [],
    updatedAt: input.createdAt
  };
}

export function upsertThreadManifestParticipant(
  manifest: SpokeThreadManifest,
  participant: { identity: string; addedAt: string }
): SpokeThreadManifest {
  if (manifest.participants.some((item) => item.identity === participant.identity)) {
    return manifest;
  }

  return {
    ...manifest,
    updatedAt: participant.addedAt,
    participants: [...manifest.participants, participant].sort((a, b) =>
      a.addedAt.localeCompare(b.addedAt)
    )
  };
}

export function buildThreadTree(input: { postId: string; replies: SpokeThreadReply[] }): ThreadTreeNode[] {
  const nodes = new Map<string, ThreadTreeNode>();
  for (const reply of sortThreadReplies(input.replies).filter((item) => item.postId === input.postId)) {
    nodes.set(threadReplyReference(reply), { reply, children: [] });
  }

  const roots: ThreadTreeNode[] = [];
  for (const node of nodes.values()) {
    if (node.reply.parent === input.postId) {
      roots.push(node);
      continue;
    }

    const parent = nodes.get(node.reply.parent);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function sortThreadReplies(replies: SpokeThreadReply[]) {
  return [...replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function legacyReplyToThreadReply(reply: SpokeReply): SpokeThreadReply {
  const postId = postIdFromPostAddress(reply.postAddress);
  return {
    schema: "spoke.reply.v2",
    id: reply.id,
    postId,
    postAuthor: reply.postAuthor,
    parent: postId,
    author: reply.sender,
    body: reply.body,
    createdAt: reply.createdAt
  };
}

export function toThreadReply(reply: SpokeAnyReply): SpokeThreadReply {
  return reply.schema === "spoke.reply.v2" ? reply : legacyReplyToThreadReply(reply);
}

export function addThreadReplyToPost(
  current: ThreadRepliesByPost,
  postAddress: string,
  reply: SpokeThreadReply
): ThreadRepliesByPost {
  const existing = current[postAddress] || [];
  const nextReference = threadReplyReference(reply);
  return {
    ...current,
    [postAddress]: sortThreadReplies([
      ...existing.filter((item) => threadReplyReference(item) !== nextReference),
      reply
    ])
  };
}

export function sortReplies(replies: SpokeReply[]) {
  return [...replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addReplyToPost(current: RepliesByPost, reply: SpokeReply): RepliesByPost {
  const existing = current[reply.postAddress] || [];
  return {
    ...current,
    [reply.postAddress]: sortReplies([
      ...existing.filter((item) => item.id !== reply.id),
      reply
    ])
  };
}

export function postIdFromPostAddress(postAddress: string) {
  const marker = "/spoke/posts/";
  const markerIndex = postAddress.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error("Reply post address must point at /spoke/posts/.");
  }

  const postId = postAddress.slice(markerIndex + marker.length).split("/")[0];
  if (!postId) {
    throw new Error("Reply post address is missing a post id.");
  }
  return postId;
}

export function threadPathForPostAddress(postAddress: string) {
  return makeThreadPath(postIdFromPostAddress(postAddress));
}

export function upsertReplyInThreadIndex(
  existing: SpokeThreadIndex | null,
  reply: SpokeReply,
  publishedReply: Pick<PublishResponse, "address" | "content_id">
): SpokeThreadIndex {
  const postId = postIdFromPostAddress(reply.postAddress);
  const nextReply = {
    id: reply.id,
    sender: reply.sender,
    address: publishedReply.address,
    contentId: publishedReply.content_id,
    createdAt: reply.createdAt,
    moderation: "accepted" as const
  };

  return {
    schema: "spoke.thread.v1",
    id: existing?.id || `thread_${postId}`,
    owner: existing?.owner || reply.postAuthor,
    postAddress: existing?.postAddress || reply.postAddress,
    visibility: "public",
    updatedAt: new Date().toISOString(),
    replies: [
      nextReply,
      ...(existing?.replies || []).filter((item) => item.id !== reply.id)
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  };
}

export function upsertReplyInThreadManifest(
  existing: SpokeThreadManifest | null,
  reply: SpokeThreadReply,
  publishedReply: Pick<PublishResponse, "address" | "content_id">
): SpokeThreadManifest {
  const createdAt = reply.createdAt;
  const base =
    existing ||
    createThreadManifest({
      postId: reply.postId,
      owner: reply.postAuthor,
      createdAt
    });
  const withParticipant = upsertThreadManifestParticipant(base, {
    identity: reply.author,
    addedAt: createdAt
  });
  const nextReply = {
    id: reply.id,
    author: reply.author,
    address: reply.address ?? publishedReply.address,
    contentId: reply.contentId ?? publishedReply.content_id,
    createdAt: reply.createdAt,
    moderation: "accepted" as const
  };
  const nextReference = `${nextReply.author}:${nextReply.id}`;

  return {
    ...withParticipant,
    updatedAt: new Date().toISOString(),
    replies: [
      ...withParticipant.replies.filter((item) => `${item.author}:${item.id}` !== nextReference),
      nextReply
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  };
}
