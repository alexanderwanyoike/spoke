import { useEffect, useState } from "react";
import type { AccountProfile } from "./account";

export function AccountIdentity({
  identity,
  profile
}: {
  identity: string;
  profile: AccountProfile;
}) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setName(null);
    void profile.load().then(
      (name) => {
        if (active) setName(name);
      },
      () => {
        if (active) setName(null);
      }
    );
    return () => {
      active = false;
    };
  }, [identity, profile]);

  const label = name || identity;
  return (
    <div className="rail-account" aria-label="Your profile" title={identity}>
      <span className="account-mark" aria-hidden="true">
        {label.slice(0, 1).toUpperCase()}
      </span>
      <div>
        <strong>{label}</strong>
        <small>Your Jolt identity</small>
      </div>
    </div>
  );
}
