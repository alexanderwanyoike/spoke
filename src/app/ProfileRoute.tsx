import { useParams } from "react-router-dom";
import { ProfilePage, type ProfileRepository } from "../profile";
import { ProfilePosts, type HomeGateway } from "../home";
export function ProfileRoute({
  identity,
  profiles,
  home,
  onSaved
}: {
  identity: string;
  profiles: ProfileRepository;
  home: HomeGateway;
  onSaved(): void;
}) {
  const { identity: owner = identity } = useParams();
  return (
    <ProfilePage key={owner} identity={identity} gateway={profiles} onSaved={onSaved}>
      <ProfilePosts identity={owner} gateway={home} />
    </ProfilePage>
  );
}
