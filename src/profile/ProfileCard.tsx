import { PublicImage } from "../media/PublicImage";
import type { PublicImages } from "../media/public";
import { useState } from "react";
import type { SpokeProfile } from "./model";

function safeLinks(profile: SpokeProfile | null) {
  return (profile?.links || []).filter((link) => {
    try {
      return ["https:", "http:"].includes(new URL(link.url).protocol);
    } catch {
      return false;
    }
  });
}
export function ProfileCard({
  identity,
  profile,
  images
}: {
  identity: string;
  profile: SpokeProfile | null;
  images?: PublicImages;
}) {
  const [copied, setCopied] = useState("");
  const name = profile?.displayName || identity;
  async function copyIdentity() {
    try {
      await navigator.clipboard.writeText(identity);
      setCopied("Identity copied.");
    } catch {
      setCopied("Select and copy the identity below.");
    }
  }
  return (
    <section className="profile-card">
      <div className="profile-banner">
        <span>People and their stories.</span>
      </div>
      <div className="profile-details">
        <span className="profile-monogram" aria-hidden="true">
          {profile?.avatar && images ? (
            <PublicImage attachment={profile.avatar} images={images} className="profile-photo" />
          ) : (
            name.slice(0, 1).toUpperCase()
          )}
        </span>
        <p className="eyebrow">Public profile</p>
        <h2>{name}</h2>
        <p className="profile-bio">{profile?.bio || "A little space to introduce yourself."}</p>
        {profile?.location && <p className="subtle">{profile.location}</p>}
        {profile?.pronouns && <p className="subtle">{profile.pronouns}</p>}
        {safeLinks(profile).map((link) => (
          <a
            key={link.url}
            className="profile-website"
            href={link.url}
            target="_blank"
            rel="noreferrer"
          >
            {link.label || link.url}
          </a>
        ))}
        <details className="identity-details">
          <summary>Jolt identity</summary>
          <code>{identity}</code>
          <button onClick={() => void copyIdentity()}>Copy identity</button>
          {copied && <p role="status">{copied}</p>}
        </details>
      </div>
    </section>
  );
}
