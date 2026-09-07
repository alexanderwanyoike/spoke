import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiErrorMessage } from "../jolt";
import { sameIdentity } from "../follow";
import { Screen } from "../shared/Screen";
import {
  createProfileEditor,
  type ProfileRepository,
  type ProfileSnapshot,
  type ProfileInput
} from "./editor";
import { ProfileCard } from "./ProfileCard";
import { ProfileForm } from "./ProfileForm";

export function ProfilePage({
  identity,
  gateway,
  onSaved
}: {
  identity: string;
  gateway: ProfileRepository;
  onSaved(): void;
}) {
  const params = useParams();
  const owner = params.identity || identity;
  const own = sameIdentity(owner, identity);
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setSnapshot(null);
    setError("");
    setEditing(false);
    void gateway.load(owner).then(
      (value) => {
        if (active) setSnapshot(value);
      },
      (cause) => {
        if (active) setError(apiErrorMessage(cause));
      }
    );
    return () => {
      active = false;
    };
  }, [gateway, owner, attempt]);
  const save = useCallback(
    async (input: ProfileInput, version: string | null, photo?: File | null) => {
      const saved = await createProfileEditor(gateway).save(input, version, photo);
      setSnapshot(saved);
      setEditing(false);
      onSaved();
    },
    [gateway, onSaved]
  );

  return (
    <Screen
      title={own ? "My profile" : "Profile"}
      description="Your public presence on Spoke."
      actions={
        own &&
        snapshot &&
        !editing && <button onClick={() => setEditing(true)}>Edit profile</button>
      }
    >
      {error && (
        <div className="page-notice" role="alert">
          {error}
          <button onClick={() => setAttempt((value) => value + 1)}>Retry</button>
        </div>
      )}
      {!snapshot && !error && <p role="status">Loading profile…</p>}
      {snapshot && !editing && (
        <ProfileCard identity={owner} profile={snapshot.profile} images={gateway.images} />
      )}
      {snapshot && editing && (
        <ProfileForm snapshot={snapshot} onSave={save} onCancel={() => setEditing(false)} />
      )}
    </Screen>
  );
}
