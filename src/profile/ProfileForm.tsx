import { useState } from "react";
import { validateImageAttachment } from "../media";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiErrorMessage } from "../jolt";
import { ProfileInput, profileDraft, type ProfileSnapshot } from "./editor";

const fields = [
  ["displayName", "Display name"],
  ["bio", "Bio"],
  ["location", "Location"],
  ["pronouns", "Pronouns"],
  ["website", "Website"]
] as const;

export function ProfileForm({
  snapshot,
  onSave,
  onCancel
}: {
  snapshot: ProfileSnapshot;
  onSave(input: ProfileInput, contentId: string | null, photo?: File | null): Promise<void>;
  onCancel(): void;
}) {
  const [photo, setPhoto] = useState<File | null | undefined>();
  const form = useForm<ProfileInput>({
    resolver: zodResolver(ProfileInput),
    defaultValues: profileDraft(snapshot.profile)
  });
  const submit = form.handleSubmit(async (input) => {
    try {
      await onSave(input, snapshot.contentId, photo);
    } catch (cause) {
      form.setError("root", { message: apiErrorMessage(cause) });
    }
  });
  return (
    <form className="profile-form" onSubmit={submit}>
      <p className="audience-note">
        Your profile is public. Share only what you want others to see.
      </p>
      <fieldset disabled={form.formState.isSubmitting}>
        <label className="field">
          <span>Profile picture</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              try {
                validateImageAttachment(file);
                setPhoto(file);
                form.clearErrors("root");
              } catch (cause) {
                form.setError("root", { message: apiErrorMessage(cause) });
              }
            }}
          />
        </label>
        {(snapshot.profile?.avatar || photo) && (
          <button type="button" onClick={() => setPhoto(null)}>
            Remove picture
          </button>
        )}
        {photo === null && <p className="subtle">Picture will be removed when you save.</p>}
        {fields.map(([key, label]) => (
          <label key={key} className="field">
            <span>{label}</span>
            {key === "bio" ? (
              <textarea rows={4} {...form.register(key)} />
            ) : (
              <input autoComplete="off" {...form.register(key)} />
            )}
            {form.formState.errors[key] && (
              <small role="alert">{form.formState.errors[key]?.message}</small>
            )}
          </label>
        ))}
      </fieldset>
      {form.formState.errors.root && <p role="alert">{form.formState.errors.root.message}</p>}
      <div className="form-actions">
        <button type="button" disabled={form.formState.isSubmitting} onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled={form.formState.isSubmitting}>
          Save profile
        </button>
      </div>
    </form>
  );
}
