import { useMessagesSnapshot } from "../message";
import { HomePage, type HomeGateway } from "../home";
import type { ProfileRepository } from "../profile";
export function HomeRoute({
  identity,
  gateway,
  profiles
}: {
  identity: string;
  gateway: HomeGateway;
  profiles: ProfileRepository;
}) {
  const { data } = useMessagesSnapshot();
  return (
    <HomePage identity={identity} contacts={data.contacts} gateway={gateway} profiles={profiles} />
  );
}
