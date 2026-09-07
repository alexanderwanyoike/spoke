import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowUp } from "lucide-react";
import { MessageInput, prepareImages } from "../input";
import { DraftImages, ImagePicker } from "./DraftImages";
import type { DraftImage } from "../drafts";
import { apiErrorMessage } from "../../jolt";
import type { MessageDraft, MessageDrafts } from "../drafts";

type Props = {
  recipient: string;
  name: string;
  drafts: MessageDrafts;
  send(recipient: string, draft: MessageDraft): Promise<void>;
};

export function MessageComposer({ recipient, name, drafts, send }: Props) {
  const form = useForm({
    resolver: zodResolver(MessageInput),
    defaultValues: { body: drafts.get(recipient).body, images: drafts.get(recipient).images }
  });
  const sending = useRef(false);
  const [error, setError] = useState("");
  const images = form.watch("images");
  function changeImages(next: DraftImage[]) {
    drafts.update(recipient, { body: form.getValues("body"), images: next });
    form.setValue("images", next, { shouldValidate: true });
  }
  function pickImages(files: File[]) {
    try {
      changeImages([...images, ...prepareImages(files, images.length)]);
      setError("");
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  }
  async function submit() {
    if (sending.current) return;
    sending.current = true;
    setError("");
    const submitted = drafts.get(recipient);
    try {
      await send(recipient, submitted);
      if (drafts.clearSubmitted(recipient, submitted)) form.reset({ body: "", images: [] });
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      sending.current = false;
    }
  }
  return (
    <form className="message-composer" onSubmit={form.handleSubmit(submit)}>
      <label htmlFor="message-body">Message {name}</label>
      <textarea
        id="message-body"
        rows={2}
        placeholder="Write a message…"
        {...form.register("body", {
          onChange: (event) =>
            drafts.update(recipient, { ...drafts.get(recipient), body: event.target.value })
        })}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
      />
      <DraftImages images={images} onChange={changeImages} />
      <p role="alert">{form.formState.errors.body?.message || error}</p>
      <footer>
        <ImagePicker onPick={pickImages} />
        <span>Enter to send · Shift + Enter for a new line</span>
        <button type="submit" disabled={form.formState.isSubmitting}>
          <ArrowUp size={16} /> Send
        </button>
      </footer>
    </form>
  );
}
