import { z } from "zod";
import { sameIdentity } from "../follow";
import type { IngressRecord } from "../jolt";

const identity = z.string().trim().min(1);
export const ContactInput = z.object({
  identity,
  displayName: z.string().trim().max(100),
  message: z.string().trim().max(1000).optional(),
  fromDisplayName: z.string().trim().max(100).optional()
});
export type ContactInput = z.infer<typeof ContactInput>;
export const ContactRecord = z.object({
  schema: z.literal("spoke.contact.v1"),
  identity,
  displayName: z.string(),
  relationship: z.enum(["accepted", "requested", "local"]),
  updatedAt: z.string(),
  removed: z.boolean().optional()
});
export const FollowRequest = z.object({
  schema: z.literal("spoke.follow_request.v1"),
  id: z.string().min(1),
  sender: identity,
  recipient: identity,
  displayName: z.string().optional(),
  message: z.string(),
  createdAt: z.string()
});
export const FollowResponse = z.object({
  schema: z.literal("spoke.follow_response.v1"),
  id: z.string().min(1),
  requestId: z.string().min(1),
  sender: identity,
  recipient: identity,
  decision: z.enum(["accepted", "rejected"]),
  createdAt: z.string()
});
export type ContactRequest = { ingressId: string; request: z.infer<typeof FollowRequest> };
export function addressedToOwner(
  record: IngressRecord,
  value: { sender: string; recipient: string },
  owner: string
) {
  return (
    sameIdentity(record.sender_identity, value.sender) &&
    sameIdentity(record.recipient_identity, owner) &&
    sameIdentity(value.recipient, owner) &&
    !sameIdentity(value.sender, owner)
  );
}
