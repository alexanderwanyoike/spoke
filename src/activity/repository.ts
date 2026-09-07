import { z } from "zod";
import type { JoltEncryptedSdk } from "../jolt";
import { sameIdentity, type SpokeFollowResponse } from "../follow";
const Record = z.discriminatedUnion("schema", [
  z.object({
    schema: z.literal("spoke.activity.contact.v1"),
    owner: z.string(),
    id: z.string(),
    actor: z.string(),
    createdAt: z.iso.datetime({ offset: true })
  }),
  z.object({
    schema: z.literal("spoke.activity.read.v1"),
    owner: z.string(),
    id: z.string(),
    readAt: z.iso.datetime({ offset: true })
  })
]);
export type ContactActivity = Extract<
  z.infer<typeof Record>,
  { schema: "spoke.activity.contact.v1" }
>;
export type SavedActivity = { contacts: ContactActivity[]; read: ReadonlySet<string> };
const PREFIX = "/spoke/activity/";
function recordPath(kind: "contacts" | "read", id: string) {
  return `${PREFIX}${kind}/${encodeURIComponent(id)}`;
}

export class ActivityRepository {
  constructor(
    private identity: string,
    private sdk: JoltEncryptedSdk
  ) {}
  async load(): Promise<SavedActivity> {
    const contacts: ContactActivity[] = [];
    const read = new Set<string>();
    const records = await this.sdk.listPublished();
    const paths = new Set(
      records
        .map((record) => record.path)
        .filter((path): path is string => typeof path === "string" && path.startsWith(PREFIX))
    );
    for (const path of paths) {
      const hit = await this.sdk.readEncrypted({ identity: this.identity, path }, (value) => {
        const result = Record.safeParse(value);
        return result.success ? result.data : null;
      });
      if (!hit) throw new Error("Some saved activity could not be opened. Refresh to try again.");
      if (!sameIdentity(hit.value.owner, this.identity)) continue;
      const event = hit.value;
      if (event.schema === "spoke.activity.read.v1" && path === recordPath("read", event.id))
        read.add(event.id);
      if (event.schema === "spoke.activity.contact.v1" && path === recordPath("contacts", event.id))
        contacts.push(event);
    }
    return { contacts, read };
  }

  async contactAccepted(response: SpokeFollowResponse) {
    if (response.decision !== "accepted" || !sameIdentity(response.recipient, this.identity))
      return;
    const event: ContactActivity = {
      schema: "spoke.activity.contact.v1",
      owner: this.identity,
      id: `contact/${response.requestId}`,
      actor: response.sender,
      createdAt: response.createdAt
    };
    await this.sdk.publishEncryptedJson(recordPath("contacts", event.id), event, [this.identity]);
  }

  async markRead(ids: string[]) {
    for (const id of new Set(ids))
      await this.sdk.publishEncryptedJson(
        recordPath("read", id),
        {
          schema: "spoke.activity.read.v1",
          owner: this.identity,
          id,
          readAt: new Date().toISOString()
        },
        [this.identity]
      );
  }
}
