import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiErrorMessage } from "../jolt";
import { ContactInput } from "./contracts";
export function IntroductionForm({
  person,
  onRequest
}: {
  person: { identity: string; name: string };
  onRequest(input: ContactInput): Promise<void>;
}) {
  const [sent, setSent] = useState(false);
  const form = useForm<ContactInput>({
    resolver: zodResolver(ContactInput),
    defaultValues: { identity: person.identity, displayName: person.name, message: "" }
  });
  const submit = form.handleSubmit(async (input) => {
    try {
      await onRequest(input);
      setSent(true);
    } catch (cause) {
      form.setError("root", { message: apiErrorMessage(cause) });
    }
  });
  if (sent) return <p role="status">Request sent. You can message each other after they accept.</p>;
  return (
    <form onSubmit={submit}>
      <fieldset disabled={form.formState.isSubmitting} className="plain-fieldset">
        <label className="field">
          <span>Name in your contacts</span>
          <input {...form.register("displayName")} />
        </label>
        <label className="field">
          <span>Introduction (optional)</span>
          <textarea rows={3} {...form.register("message")} />
        </label>
      </fieldset>
      {form.formState.errors.displayName && (
        <p role="alert">{form.formState.errors.displayName.message}</p>
      )}
      {form.formState.errors.message && <p role="alert">{form.formState.errors.message.message}</p>}
      {form.formState.errors.root && <p role="alert">{form.formState.errors.root.message}</p>}
      <button className="primary-button" disabled={form.formState.isSubmitting}>
        Send request
      </button>
    </form>
  );
}
