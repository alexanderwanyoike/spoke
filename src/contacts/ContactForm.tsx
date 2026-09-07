import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiErrorMessage } from "../jolt";
import { ContactInput } from "./contracts";

export function ContactForm({ onRequest }: { onRequest(input: ContactInput): Promise<void> }) {
  const [notice, setNotice] = useState("");
  const form = useForm<ContactInput>({
    resolver: zodResolver(ContactInput),
    defaultValues: { identity: "", displayName: "" }
  });
  const submit = form.handleSubmit(async (input) => {
    setNotice("");
    try {
      await onRequest(input);
      form.reset();
      setNotice("Request sent. Your conversation will appear when they accept.");
    } catch (cause) {
      form.setError("root", { message: apiErrorMessage(cause) });
    }
  });
  return (
    <form className="contact-form" onSubmit={submit}>
      <label htmlFor="contact-identity">Jolt identity</label>
      <input
        id="contact-identity"
        autoComplete="off"
        placeholder="Their identity.jolt address"
        {...form.register("identity")}
      />
      {form.formState.errors.identity && <p role="alert">Enter a Jolt identity.</p>}
      <label htmlFor="contact-name">Name in your contacts</label>
      <input
        id="contact-name"
        autoComplete="off"
        placeholder="A name you will recognise"
        {...form.register("displayName")}
      />
      {form.formState.errors.displayName && <p role="alert">Keep the name under 100 characters.</p>}
      {form.formState.errors.root && <p role="alert">{form.formState.errors.root.message}</p>}
      {notice && <p role="status">{notice}</p>}
      <button className="primary-button" disabled={form.formState.isSubmitting} type="submit">
        Send request
      </button>
    </form>
  );
}
