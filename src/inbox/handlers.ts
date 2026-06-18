// Per-feature inbox handlers. Each one matches a decoded payload type, decides
// auto vs manual, and delegates acceptance to the relevant feature command. The
// inbox loop (index.ts) is unaware of follows/messages/replies; all the social
// rules live here and in the feature seams.

import {
  acceptFollowRequest,
  applyIncomingResponse,
  hasAcceptedContactForIdentity,
  hasRequestedContactForResponse,
  isSpokeFollowRequest,
  isSpokeFollowResponse,
  readContacts,
  sendFollowResponse,
  type SpokeFollowRequest,
  type SpokeFollowResponse
} from "../follow";
import {
  acceptReceivedMessage,
  isSpokeMessage,
  messageBelongsToConversation,
  messageTargetsIdentity,
  type SpokeMessage
} from "../message";
import {
  acceptReply,
  acceptanceDecision,
  isReplyV2,
  type SpokeReplyV2,
  type ThreadEnumeration
} from "../thread";
import type { InboxContext, InboxHandler } from "./index";

// Follow response: auto-apply only for a follow request we actually sent (so a
// stranger cannot flip our relationship state); otherwise leave for review.
function followResponseHandler(): InboxHandler {
  return {
    match: isSpokeFollowResponse,
    classify(payload, ctx) {
      const contacts = readContacts(ctx.localIdentity, ctx.store);
      return hasRequestedContactForResponse(contacts, payload as SpokeFollowResponse)
        ? "auto"
        : "manual";
    },
    async accept(sdk, payload, ctx) {
      await applyIncomingResponse(sdk, ctx.localIdentity, payload as SpokeFollowResponse, ctx.store);
    }
  };
}

// Follow request: always reviewed by the user. Accept records an accepted edge
// and replies; reject notifies the requester it was declined.
function followRequestHandler(): InboxHandler {
  return {
    match: isSpokeFollowRequest,
    classify() {
      return "manual";
    },
    async accept(sdk, payload, ctx) {
      await acceptFollowRequest(sdk, ctx.localIdentity, payload as SpokeFollowRequest, ctx.store);
    },
    async reject(sdk, payload, ctx) {
      await sendFollowResponse(sdk, ctx.localIdentity, payload as SpokeFollowRequest, "rejected");
    }
  };
}

// Message: auto-accept only from an accepted contact, addressed to us, in its
// own derived conversation. Everything else is reviewed.
function messageHandler(): InboxHandler {
  function deliverable(message: SpokeMessage, ctx: InboxContext) {
    return messageBelongsToConversation(message) && messageTargetsIdentity(message, ctx.localIdentity);
  }
  return {
    match: isSpokeMessage,
    classify(payload, ctx) {
      const message = payload as SpokeMessage;
      const contacts = readContacts(ctx.localIdentity, ctx.store);
      return hasAcceptedContactForIdentity(contacts, message.sender) && deliverable(message, ctx)
        ? "auto"
        : "manual";
    },
    async accept(sdk, payload, ctx) {
      const message = payload as SpokeMessage;
      if (!deliverable(message, ctx)) {
        throw new Error("Message is not addressed to this Spoke identity.");
      }
      await acceptReceivedMessage(sdk, ctx.localIdentity, message, ctx.store);
    }
  };
}

// Reply (v2): author-anchored acceptance (ADR 0002). Auto-accept from contacts,
// review from strangers. Legacy v1 replies match no handler and are simply
// acknowledged when reviewed.
function replyHandler(threadBridge: ThreadEnumeration): InboxHandler {
  return {
    match: isReplyV2,
    classify(payload, ctx) {
      const reply = payload as SpokeReplyV2;
      const contacts = readContacts(ctx.localIdentity, ctx.store);
      return acceptanceDecision({ sender: reply.sender, contacts }) === "auto" ? "auto" : "manual";
    },
    async accept(sdk, payload, ctx) {
      await acceptReply(sdk, threadBridge, payload as SpokeReplyV2, ctx.store);
    }
  };
}

export function createInboxHandlers(deps: { threadBridge: ThreadEnumeration }): InboxHandler[] {
  return [
    followResponseHandler(),
    followRequestHandler(),
    messageHandler(),
    replyHandler(deps.threadBridge)
  ];
}
