import { createContext, useContext, useState, type ReactNode } from "react";
import { normalizeIdentity } from "../follow";
import type { ProfileAvatars } from "./avatars";
import { useAvatarUrl } from "./use-avatar-url";

const AvatarContext = createContext<ProfileAvatars | null>(null);
export function ProfileAvatarsProvider({
  source,
  children
}: {
  source: ProfileAvatars;
  children: ReactNode;
}) {
  return <AvatarContext.Provider value={source}>{children}</AvatarContext.Provider>;
}

export function ProfileAvatar({
  identity,
  name,
  className = "person-avatar"
}: {
  identity: string;
  name: string;
  className?: string;
}) {
  const owner = normalizeIdentity(identity);
  return <AvatarPicture key={owner} identity={owner} name={name} className={className} />;
}

function AvatarPicture({
  identity,
  name,
  className
}: {
  identity: string;
  name: string;
  className: string;
}) {
  const source = useContext(AvatarContext);
  const url = useAvatarUrl(source, identity);
  const [failedUrl, setFailedUrl] = useState("");

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return (
    <span className={className}>
      {url && url !== failedUrl ? (
        <img
          className="avatar-photo"
          src={url}
          alt={`${name} profile picture`}
          onError={() => setFailedUrl(url)}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
