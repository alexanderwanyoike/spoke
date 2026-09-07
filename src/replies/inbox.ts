import type { IngressRecord, JoltIngressSdk } from "../jolt";
import { hasAcceptedContactForIdentity, sameIdentity, type Contact } from "../follow";
import { ReplyRequest, type Reply, type ReplyReview } from "./contracts";
import type { ReplyRepository } from "./repository";

type Snapshot = { requests: ReplyReview[]; unavailable: number };
export class ReplyInbox {
  private snapshot: Snapshot = { requests: [], unavailable: 0 };
  private listeners = new Set<() => void>();
  constructor(
    private identity: string,
    private sdk: JoltIngressSdk,
    private repository: ReplyRepository,
    private requireVisibleParent: (reply: Reply) => Promise<void>
  ) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  async review(contacts: Contact[], signal?: AbortSignal) {
    const requests: ReplyReview[] = [];
    let unavailable = 0;
    for (const record of await this.sdk.listPendingIngress()) {
      signal?.throwIfAborted();
      try {
        const reply = await this.verify(record);
        if (!reply) continue;
        if (hasAcceptedContactForIdentity(contacts, reply.sender)) {
          signal?.throwIfAborted();
          await this.repository.accept(this.identity, reply);
          signal?.throwIfAborted();
          await this.sdk.acceptIngress(record.ingress_id);
        } else requests.push({ ingressId: record.ingress_id, reply });
      } catch {
        unavailable++;
        const previous = this.snapshot.requests.find(
          (item) => item.ingressId === record.ingress_id
        );
        if (previous) requests.push(previous);
      }
    }
    signal?.throwIfAborted();
    this.snapshot = { requests, unavailable };
    this.listeners.forEach((listener) => listener());
  }

  async decide(id: string, decision: "accepted" | "rejected") {
    const record = (await this.sdk.listPendingIngress()).find((record) => record.ingress_id === id);
    const reply = record && (await this.verify(record));
    if (!reply)
      throw new Error("This reply request is no longer available or could not be verified.");
    if (decision === "rejected") await this.sdk.rejectIngress(id);
    else {
      await this.repository.accept(this.identity, reply);
      await this.sdk.acceptIngress(id);
    }
    this.snapshot = {
      ...this.snapshot,
      requests: this.snapshot.requests.filter((item) => item.ingressId !== id)
    };
    this.listeners.forEach((listener) => listener());
  }

  private async verify(record: IngressRecord) {
    const parsed = ReplyRequest.safeParse(await this.sdk.openIngress(record.ingress_id));
    if (!parsed.success) return null;
    const request = parsed.data;
    if (
      !sameIdentity(request.sender, record.sender_identity) ||
      !sameIdentity(request.recipient, this.identity) ||
      !sameIdentity(record.recipient_identity, this.identity)
    )
      return null;
    const hit = await this.repository.read(request.sender, request.postId, request.replyId);
    if (!hit || !sameIdentity(hit.value.postAuthor, this.identity)) return null;
    await this.requireVisibleParent(hit.value);
    return hit.value;
  }
}
