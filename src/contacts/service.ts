import { ContactRepository } from "./repository";
import type { Store } from "../common/store";
import {
  acceptFollowRequest,
  applyIncomingResponse,
  requestFollow,
  sendFollowResponse,
  sameIdentity,
  type SpokeFollowResponse
} from "../follow";
import type { JoltEncryptedSdk, JoltIngressSdk, IngressRecord } from "../jolt";
import {
  addressedToOwner,
  ContactInput,
  FollowRequest,
  FollowResponse,
  type ContactRequest
} from "./contracts";

type ContactSdk = JoltEncryptedSdk & JoltIngressSdk;
export type ContactActions = Pick<ContactService, "request" | "decide">;

export class ContactService {
  constructor(
    private sdk: ContactSdk,
    private identity: string,
    private store: Store,
    private onAcceptedResponse: (response: SpokeFollowResponse) => Promise<void> = async () => {}
  ) {}

  async request(input: ContactInput, signal?: AbortSignal) {
    const draft = ContactInput.parse(input);
    await new ContactRepository(this.sdk, this.identity, this.store).requireNewContact(
      draft.identity
    );
    signal?.throwIfAborted();
    await requestFollow(this.sdk, this.identity, draft, this.store);
  }

  async review(signal?: AbortSignal): Promise<ContactRequest[]> {
    const records = await this.sdk.listPendingIngress();
    const requests: ContactRequest[] = [];
    for (const record of records) {
      signal?.throwIfAborted();
      const payload = await this.sdk.openIngress(record.ingress_id);
      await this.applyResponse(record, payload, signal);
      const request = this.verifiedRequest(record, payload);
      if (request) requests.push({ ingressId: record.ingress_id, request });
    }
    return requests;
  }

  async decide(ingressId: string, decision: "accepted" | "rejected", signal?: AbortSignal) {
    const record = (await this.sdk.listPendingIngress()).find(
      (item) => item.ingress_id === ingressId
    );
    const request = record && (await this.readRequest(record));
    if (!request)
      throw new Error("This contact request is no longer available or could not be verified.");
    signal?.throwIfAborted();
    if (decision === "accepted")
      await acceptFollowRequest(this.sdk, this.identity, request, this.store);
    else await sendFollowResponse(this.sdk, this.identity, request, "rejected");
    signal?.throwIfAborted();
    await this.sdk.acceptIngress(ingressId);
  }

  private async readRequest(record: IngressRecord) {
    return this.verifiedRequest(record, await this.sdk.openIngress(record.ingress_id));
  }

  private verifiedRequest(record: IngressRecord, payload: unknown) {
    const result = FollowRequest.safeParse(payload);
    if (!result.success || !addressedToOwner(record, result.data, this.identity)) return null;
    return result.data;
  }

  private async applyResponse(record: IngressRecord, payload: unknown, signal?: AbortSignal) {
    const result = FollowResponse.safeParse(payload);
    if (!result.success || !addressedToOwner(record, result.data, this.identity)) return;
    const response = result.data;
    const original = await this.sdk.readEncrypted(
      { identity: this.identity, path: `/spoke/outgoing/${response.requestId}` },
      (value) => {
        const parsed = FollowRequest.safeParse(value);
        return parsed.success ? parsed.data : null;
      }
    );
    if (
      !original ||
      !sameIdentity(original.value.recipient, response.sender) ||
      !sameIdentity(original.value.sender, this.identity) ||
      original.value.id !== response.requestId
    )
      return;
    signal?.throwIfAborted();
    await applyIncomingResponse(this.sdk, this.identity, response, this.store);
    if (response.decision === "accepted") await this.onAcceptedResponse(response);
    signal?.throwIfAborted();
    await this.sdk.acceptIngress(record.ingress_id);
  }
}
