import { ActivityRepository } from "../activity/repository";
import { createJoltSdk } from "../jolt";
import { createActivityGateway } from "../activity/gateway";
import { createHomeGateway } from "../home";
import { createMessagesGateway } from "../message";
import { createAccountProfile, createProfilesGateway } from "../profile";
import { createRepliesGateway } from "../replies/gateway";

export function createRuntime(identity: string, token: string) {
  const home = createHomeGateway(token, identity);
  const replies = createRepliesGateway(identity, token, home);
  const activityRepository = new ActivityRepository(
    identity,
    createJoltSdk(() => token)
  );
  const activity = createActivityGateway(identity, activityRepository, replies.repository);
  const messages = createMessagesGateway(identity, token, {
    reviewInbox: async (contacts, signal) => {
      await replies.inbox.review(contacts, signal);
      return replies.inbox.getSnapshot().requests.length;
    },
    contactAccepted: (response) => activityRepository.contactAccepted(response)
  });
  return {
    home,
    activity,
    replies,
    messages,
    profile: createAccountProfile(identity, token),
    profiles: createProfilesGateway(identity, token)
  };
}
