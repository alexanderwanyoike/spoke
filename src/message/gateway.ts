import { createJoltSdk } from "../jolt";
import type { ContactActions } from "../contacts";
import type { SpokeMessageAttachment } from "../media";
import type { MessageDraft } from "./drafts";
import type { MessagesData } from "./view-model";
import { createMessagesApplication, type SessionEffects } from "./application";
import { createMessageMedia } from "./media-repository";

export interface MessagesGateway {
  load(signal?: AbortSignal): Promise<MessagesData>;
  resolveNames?(data: MessagesData): Promise<MessagesData>;
  send(recipient: string, draft: MessageDraft, signal?: AbortSignal): Promise<void>;
  loadImage(attachment: SpokeMessageAttachment): Promise<Blob>;
  contacts: ContactActions;
  confirmed: ReadonlySet<string>;
}

export function createMessagesGateway(
  identity: string,
  token: string,
  effects?: SessionEffects
): MessagesGateway {
  return createMessagesApplication(
    identity,
    createJoltSdk(() => token),
    createMessageMedia(identity, token),
    effects
  );
}
