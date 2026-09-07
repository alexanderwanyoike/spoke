import { useState } from "react";
import { Dialog } from "radix-ui";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { apiErrorMessage } from "../jolt";
import { sameIdentity } from "../follow";
import type { ProfileRepository } from "../profile/editor";
import { ContactInput } from "./contracts";
import { IntroductionForm } from "./IntroductionForm";

export function FindPerson({
  identity,
  profiles,
  onRequest,
  onClose
}: {
  identity: string;
  profiles: ProfileRepository;
  onRequest(input: ContactInput): Promise<void>;
  onClose(): void;
}) {
  const [person, setPerson] = useState<{ identity: string; name: string; bio: string } | null>(
    null
  );
  const form = useForm<{ identity: string }>({
    resolver: zodResolver(ContactInput.pick({ identity: true })),
    defaultValues: { identity: "" }
  });
  const lookup = form.handleSubmit(async (input) => {
    setPerson(null);
    if (sameIdentity(identity, input.identity)) {
      form.setError("identity", { message: "This is your own identity." });
      return;
    }
    try {
      const result = await profiles.load(input.identity);
      setPerson({
        identity: input.identity,
        name: result.profile?.displayName || input.identity,
        bio:
          result.profile?.bio ||
          "A public profile is not available. Check the identity before sending a request."
      });
    } catch (cause) {
      form.setError("root", { message: apiErrorMessage(cause) });
    }
  });
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="contact-overlay" />
        <Dialog.Content className="contact-dialog find-person-dialog">
          <Dialog.Title>Find someone</Dialog.Title>
          <Dialog.Description>Use a Jolt identity shared with you.</Dialog.Description>
          <Dialog.Close className="icon-button dialog-close" aria-label="Close find someone">
            <X size={19} />
          </Dialog.Close>
          <form onSubmit={lookup} className="lookup-form">
            <label className="field">
              <span>Jolt identity</span>
              <input
                {...form.register("identity")}
                autoComplete="off"
                disabled={form.formState.isSubmitting}
              />
            </label>
            {form.formState.errors.identity && (
              <p role="alert">{form.formState.errors.identity.message}</p>
            )}
            {form.formState.errors.root && <p role="alert">{form.formState.errors.root.message}</p>}
            <button disabled={form.formState.isSubmitting}>Look up identity</button>
          </form>
          {person && (
            <section className="lookup-result">
              <h3>{person.name}</h3>
              <p>{person.bio}</p>
              <IntroductionForm key={person.identity} person={person} onRequest={onRequest} />
            </section>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
