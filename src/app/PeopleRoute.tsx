import { PeoplePage } from "../contacts";
import { useMessagesServices, useMessagesSnapshot } from "../message";
import type { ProfileRepository } from "../profile";

export function PeopleRoute({
  identity,
  profiles
}: {
  identity: string;
  profiles: ProfileRepository;
}) {
  const { data, error, status } = useMessagesSnapshot();
  const { resource, requestContact, decideContact } = useMessagesServices();
  async function request(input: Parameters<typeof requestContact>[0]) {
    const own = await profiles.load(identity);
    await requestContact({ ...input, fromDisplayName: own.profile?.displayName || identity });
  }
  return (
    <PeoplePage
      identity={identity}
      profiles={profiles}
      contacts={data.contacts}
      requests={data.contactRequests}
      error={error}
      loading={status === "loading"}
      onRefresh={() => void resource.refresh()}
      onRequest={request}
      onDecide={decideContact}
    />
  );
}
