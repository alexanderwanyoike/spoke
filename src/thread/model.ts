// Thread model: schemas, decoders, normalization, and the nested-tree builder.
// Threads are author-anchored (ADR 0002): replies are Append Records under the
// replier; accepted-reply references are an Append-Record Collection owned by
// the post author. Legacy spoke.reply.v1 normalizes into the same Projection.

import type { Decoder } from "../jolt";

// Legacy v1 reply, retained read-only (tolerant readers). New replies are
// spoke.reply.v2 (defined below as SpokeReplyV2).
export type SpokeReply = {
  schema: "spoke.reply.v1";
  id: string;
  sender: string;
  postAuthor: string;
  postAddress: string;
  body: string;
  createdAt: string;
};

export const REPLIES_PREFIX = "/spoke/replies/";
export const ACCEPTED_PREFIX = "/spoke/accepted/";
const POSTS_MARKER = "/spoke/posts/";

// A reply authored under the replier's own identity.
export type SpokeReplyV2 = {
  schema: "spoke.reply.v2";
  id: string;
  postId: string;
  postAuthor: string;
  // postId for a top-level reply, or another reply's id for a nested reply.
  parent: string;
  sender: string;
  body: string;
  createdAt: string;
};

// An accepted-reply reference, owned by the post author. Points at where the
// reply bytes live. `removed` is the tombstone (un-accept).
export type AcceptedReplyRef = {
  schema: "spoke.accepted_reply.v1";
  postId: string;
  replyId: string;
  replyRef: { identity: string; path: string };
  acceptedAt: string;
  removed?: boolean;
};

// A reply normalized for the Projection (unifies v1 + v2).
export type ThreadReply = {
  id: string;
  postId: string;
  parentId: string; // postId for a top-level reply
  sender: string;
  body: string;
  createdAt: string;
  schema: "spoke.reply.v1" | "spoke.reply.v2";
};

export type ThreadNode = ThreadReply & { children: ThreadNode[] };

export function makeReplyPath(postId: string, replyId: string) {
  return `${REPLIES_PREFIX}${postId}/${replyId}`;
}

export function makeAcceptedRefPath(postId: string, replyId: string) {
  return `${ACCEPTED_PREFIX}${postId}/${replyId}`;
}

// The accepted-reply Collection prefix for a post: the post author publishes one
// accepted-reference append record per accepted reply under here, and a reader
// enumerates the prefix (J1). Replaces the per-post /spoke/threads index.
export function makeAcceptedPrefix(postId: string) {
  return `${ACCEPTED_PREFIX}${postId}/`;
}

export function postIdFromPostAddress(postAddress: string): string {
  const markerIndex = postAddress.indexOf(POSTS_MARKER);
  if (markerIndex < 0) {
    return postAddress;
  }
  return postAddress.slice(markerIndex + POSTS_MARKER.length).split("/")[0] || postAddress;
}

export function isReplyV2(value: unknown): value is SpokeReplyV2 {
  return typeof value === "object" && value !== null &&
    (value as { schema?: unknown }).schema === "spoke.reply.v2";
}

export function isReplyV1(value: unknown): value is SpokeReply {
  return typeof value === "object" && value !== null &&
    (value as { schema?: unknown }).schema === "spoke.reply.v1";
}

export function isAcceptedReplyRef(value: unknown): value is AcceptedReplyRef {
  return typeof value === "object" && value !== null &&
    (value as { schema?: unknown }).schema === "spoke.accepted_reply.v1";
}

export const decodeReplyV2: Decoder<SpokeReplyV2> = (v) => (isReplyV2(v) ? v : null);
export const decodeAcceptedReplyRef: Decoder<AcceptedReplyRef> = (v) =>
  isAcceptedReplyRef(v) ? v : null;

// A reply can arrive as v2 or as a legacy flat v1; both normalize to ThreadReply.
export const decodeAnyReply: Decoder<SpokeReplyV2 | SpokeReply> = (v) =>
  isReplyV2(v) ? v : isReplyV1(v) ? v : null;

export function normalizeReply(reply: SpokeReplyV2 | SpokeReply): ThreadReply {
  if (reply.schema === "spoke.reply.v2") {
    return {
      id: reply.id,
      postId: reply.postId,
      parentId: reply.parent,
      sender: reply.sender,
      body: reply.body,
      createdAt: reply.createdAt,
      schema: "spoke.reply.v2"
    };
  }
  // Legacy v1: flat, no parent. Treat as a top-level reply (parent = post).
  const postId = postIdFromPostAddress(reply.postAddress);
  return {
    id: reply.id,
    postId,
    parentId: postId,
    sender: reply.sender,
    body: reply.body,
    createdAt: reply.createdAt,
    schema: "spoke.reply.v1"
  };
}

// Flatten a thread tree back into a list (e.g. to collect every reply author).
export function flattenThread(nodes: ThreadNode[]): ThreadNode[] {
  return nodes.flatMap((node) => [node, ...flattenThread(node.children)]);
}

// Assemble a nested tree from a flat list of replies, oldest-first at each
// level. A reply is a root when its parent is the post (or an unknown reply).
export function buildThreadTree(replies: ThreadReply[]): ThreadNode[] {
  const sorted = [...replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const nodes = new Map<string, ThreadNode>();
  for (const reply of sorted) {
    nodes.set(reply.id, { ...reply, children: [] });
  }
  const roots: ThreadNode[] = [];
  for (const reply of sorted) {
    const node = nodes.get(reply.id)!;
    const parent = reply.parentId === reply.postId ? undefined : nodes.get(reply.parentId);
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
