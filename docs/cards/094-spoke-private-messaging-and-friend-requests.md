# 094: Spoke Private Messaging and Friend Requests

**Type:** HITL then AFK
**Milestone:** Post-v0 Social
**Status:** Designed in PR
**Blocked by:** 091
**Related:** 092

## Why

Spoke currently has no direct messaging. Replies are public (or encrypted
but attached to a post). There is no way for Alice to send Bob a private
message that is not tied to a post. There is also no concept of friendship:
Alice can add Bob as a contact locally, but Bob has no say in the matter.
Real social interaction needs:

- private one-to-one messaging between identities;
- a mutual friendship model where both parties agree to the relationship;
- friend requests as the entry point for messaging from non-friends.

## Product Bet

Messaging in Spoke should feel like a simple direct message layer, not a
full chat application. Messages are encrypted between two identities using
Jolt's existing encrypted content envelopes. The friend request model gives
recipients control over who can message them.

### Friendship model

Current state: contacts are local-only. Alice adds Bob's `.jolt` identity to
her contact list. Bob has no idea this happened.

Proposed state: friendship is mutual and explicit.

- Alice sends Bob a friend request via ingress.
- Bob sees the request in his incoming queue and accepts or rejects.
- If accepted, both Alice and Bob can message each other.
- If rejected, Alice cannot send messages to Bob (Bob's Spoke policy drops
  them).

Friendship state is stored locally by each party:

- Alice stores: `{ identity: "bob.jolt", status: "accepted", since:
  "2026-..." }`
- Bob stores: `{ identity: "alice.jolt", status: "accepted", since:
  "2026-..." }`

Friendship is not published to a shared path. Each party maintains their own
local view. This avoids needing a shared friendship ledger and keeps the
model compatible with Jolt's identity-owned paths.

### Messaging model

Messages are encrypted content envelopes sent via ingress:

1. Alice writes a message to Bob.
2. Spoke encrypts the message for Bob (and Alice as self-recipient) using
   the daemon's encrypted publish API.
3. The encrypted message is published under Alice's
   `/spoke/messages/outgoing/{id}` for Alice's sent copy.
4. The encrypted bytes are submitted to Bob via ingress.
5. Bob receives the ingress, opens it, and sees Alice's message.
6. Bob's Spoke stores the decrypted message locally.

This is the same pattern as current Spoke replies, but without being
attached to a post. The key difference is the friend request gate: Bob's
Spoke policy only accepts messages from identities in his friends list with
status `"accepted"`.

## What to Build

### New schemas

```json
{
  "schema": "spoke.friend-request.v1",
  "from": "alice.jolt",
  "to": "bob.jolt",
  "message": "Hey Bob, it's Alice from the Jolt demo!",
  "createdAt": "2026-06-10T12:00:00Z"
}
```

```json
{
  "schema": "spoke.message.v1",
  "id": "msg_abc123",
  "from": "alice.jolt",
  "to": "bob.jolt",
  "body": "Hey Bob, want to collaborate on a Spoke feature?",
  "createdAt": "2026-06-10T12:05:00Z"
}
```

### New local storage

Replace the current local-only contacts model with a friends model:

```json
{
  "identity": "bob.jolt",
  "displayName": "Bob",
  "status": "accepted" | "pending-outgoing" | "pending-incoming" | "rejected",
  "since": "2026-06-10T12:00:00Z",
  "lastMessageAt": "2026-06-10T12:05:00Z"
}
```

This is stored in localStorage under a new key (e.g. `spoke.friends`).
The existing `spoke.contacts` key is migrated on first load.

### Friend request flow

1. Alice enters Bob's `.jolt` identity and an optional message.
2. Alice's Spoke publishes an encrypted friend request envelope.
3. The encrypted bytes are submitted to Bob via ingress.
4. Bob's Spoke sees a pending ingress with `schema_hint:
   "spoke.friend-request.v1"`.
5. Bob opens the request, sees Alice's identity and optional message.
6. Bob accepts or rejects.

On accept:

- Bob's Spoke stores Alice as a friend with `"accepted"` status.
- Bob's Spoke sends an acceptance notification back to Alice via ingress.
  This is a `spoke.friend-accept.v1` envelope:
  ```json
  {
    "schema": "spoke.friend-accept.v1",
    "from": "bob.jolt",
    "acceptedAt": "2026-06-10T12:01:00Z"
  }
  ```
- Alice receives the acceptance and updates Bob's status from
  `"pending-outgoing"` to `"accepted"`.

On reject:

- Bob's Spoke stores Alice as `"rejected"`. Future messages from Alice are
  dropped at Bob's Spoke policy layer.
- Optionally send a rejection notification to Alice, or simply silently
  drop. Silent drop is recommended for v1 to avoid rejection harassment.

### Messaging flow

1. Alice selects a friend from her friends list.
2. Alice writes a message and sends.
3. Alice's Spoke encrypts the message for Bob using the daemon's encrypted
   publish API.
4. The encrypted message is published under Alice's
   `/spoke/messages/outgoing/{id}` (Alice's sent copy, self-encrypted).
5. The encrypted bytes are submitted to Bob via ingress.
6. Bob's Spoke checks: is Alice in Bob's friends list with `"accepted"`
   status? If yes, open the ingress and store the message. If no, reject
   the ingress.
7. Bob sees the message in his conversation with Alice.

### Conversation view

- The messaging UI is a simple conversation list (one row per friend) and
  a message thread (chronological list of messages between Alice and Bob).
- Messages are stored locally by each party. Alice stores her sent messages
  (from `/spoke/messages/outgoing/`) and received messages (from accepted
   ingress). Bob does the same.
- There is no shared conversation state. Each party has their own local view.
- Message ordering is by `createdAt` timestamp.

### Reply flow integration

With the friend model in place, post replies from card 091 should gate on
friendship:

- Only friends can reply to a post via ingress. Replies from non-friends
  are rejected at the recipient's Spoke policy layer.
- The post author's Spoke checks: is the replier in the author's friends
  list with `"accepted"` status? If yes, accept the reply and update the
  thread manifest. If no, reject the ingress.

This ties the threading model to the friendship model: you must be friends
to participate in someone's thread.

## Design Decisions

### D1: Friendship storage

- **Local-only (recommended):** each party stores their own friendship state
  in localStorage. No published friendship object. Simple, private, but
  friendship state is lost if localStorage is cleared.
- **Published:** each party publishes their friend list under a path like
  `/spoke/friends`. Publicly visible, more durable, but exposes social
  graph. Contradicts the privacy goal.

Local-only for v1. The social graph is private. Friendship durability can
be improved later with encrypted published state if needed.

### D2: Message history storage

- **Local-only (recommended for v1):** messages are stored in localStorage.
  Simple, private, but history is lost on clear. Adequate for a PoC.
- **Encrypted published:** Alice publishes encrypted conversation objects
  under `/spoke/messages/sent/{id}` and stores received messages locally.
  More durable but more complex and consumes publish paths.

Local-only for v1. Message history durability is a follow-up concern.

### D3: Messaging from non-friends

- **Hard block (recommended):** non-friends cannot send messages at all.
  If Alice tries to message Bob and they are not friends, Spoke prompts
  Alice to send a friend request first.
- **Queue as request:** non-friends can send a message, but it arrives as
  a friend request with the message attached. If Bob accepts, the message
  is delivered. If Bob rejects, the message is discarded.

Hard block is simpler and avoids the complexity of message-laden friend
requests. The friend request already has an optional message field for an
introduction.

### D4: Group messaging

Not included in this card. Group messaging requires multi-recipient
encryption, a shared conversation state, and participant management that
goes beyond the simple one-to-one model. This is a significant scope
increase. One-to-one messaging first, group messaging as a separate card.

### D5: Message types

For v1, messages are plain text only. No image attachments, no link
previews, no replies to messages. Rich message content can reuse the
attachment model from card 093 in a future iteration.

### D6: Thread replies gated on friendship

Should post replies (card 091) require friendship?

- **Yes (recommended):** only friends can reply to posts. This creates a
  clear social boundary: your thread is only visible to and participatable
  by people you have accepted as friends. Aligns with the "known identities"
  model.
- **No:** anyone who can resolve the post can reply. More open, but allows
  spam and unwanted replies from strangers.

Yes for v1. Spoke is for known people. If open replies are needed later,
that is a product decision that can be layered on top.

## Acceptance Criteria

- [ ] A user can send a friend request to a `.jolt` identity with an
      optional message.
- [ ] The recipient can see the friend request in their incoming queue.
- [ ] The recipient can accept the friend request. Both parties see the
      friendship as accepted.
- [ ] The recipient can reject the friend request. The sender sees the
      status as rejected or pending (silent reject).
- [ ] Two friends can exchange private messages.
- [ ] Messages are encrypted end-to-end via Jolt's encrypted content
      envelopes.
- [ ] Non-friends cannot send messages. The UI prompts for a friend request.
- [ ] Messages from non-friends are rejected at the recipient's policy layer.
- [ ] The conversation view shows a chronological message thread per friend.
- [ ] Post replies from non-friends are rejected.
- [ ] Existing local contacts are migrated to the new friends model on first
      load.

## Non-Goals

- Group messaging or group chats.
- Message attachments (images, links in messages).
- Message editing or deletion.
- Read receipts or typing indicators.
- Message search.
- Published or shared friendship state.
- Blocking or muting beyond rejection.
- Message history persistence beyond localStorage.

## Verification

- Green: `npm test` in `/home/alexander/Code/Apps/jolt-apps/spoke`.
- Green: `npm run build` in `/home/alexander/Code/Apps/jolt-apps/spoke`.
- Green: Alice sends Bob a friend request. Bob accepts. Alice and Bob can
  exchange private messages.
- Green: Alice sends Carol a friend request. Carol rejects. Alice cannot
  message Carol.
- Green: Alice sends a post reply to Bob (friend). Bob receives it. Alice
  sends a post reply to Carol (non-friend). Carol's Spoke rejects the
  ingress.
