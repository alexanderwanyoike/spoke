import { createHomeGateway } from "../home";
import { createMessagesGateway } from "../message";
import { createAccountProfile, createProfilesGateway } from "../profile";
import { createRepliesGateway } from "../replies/gateway";

export function createRuntime(identity: string, token: string) {
  const home = createHomeGateway(token, identity);
  const replies = createRepliesGateway(identity, token, home);
  const messages = createMessagesGateway(identity, token, (contacts, signal) =>
    replies.inbox.review(contacts, signal)
  );
  return {
    home,
    replies,
    messages,
    profile: createAccountProfile(identity, token),
    profiles: createProfilesGateway(identity, token)
  };
}
