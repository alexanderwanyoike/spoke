import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiErrorMessage, makeId } from "../jolt";
import { ReplyBody } from "./contracts";
import type { ReplyDraft } from "./service";
const Fields = z.object({ body: ReplyBody });
export function ReplyForm({
  owner,
  postId,
  parent,
  onSubmit,
  onCancel
}: {
  owner: string;
  postId: string;
  parent: { id: string; name: string };
  onSubmit(draft: ReplyDraft): Promise<void>;
  onCancel(): void;
}) {
  const [publication] = useState(() => ({
    id: makeId("reply"),
    createdAt: new Date().toISOString()
  }));
  const form = useForm<z.infer<typeof Fields>>({
    resolver: zodResolver(Fields),
    defaultValues: { body: "" }
  });
  const submit = form.handleSubmit(async ({ body }) => {
    try {
      await onSubmit({ ...publication, body, postAuthor: owner, postId, parent: parent.id });
    } catch (cause) {
      form.setError("root", { message: apiErrorMessage(cause) });
    }
  });
  return (
    <form className="reply-form" onSubmit={submit}>
      <div className="reply-form-heading">
        <strong>Reply to {parent.name}</strong>
        {parent.id !== postId && (
          <button type="button" onClick={onCancel}>
            Cancel reply
          </button>
        )}
      </div>
      <label className="sr-only" htmlFor="public-reply">
        Your reply
      </label>
      <textarea
        id="public-reply"
        rows={3}
        placeholder="Add to the conversation…"
        {...form.register("body")}
        disabled={form.formState.isSubmitting}
      />
      {form.formState.errors.body && <p role="alert">{form.formState.errors.body.message}</p>}
      {form.formState.errors.root && <p role="alert">{form.formState.errors.root.message}</p>}
      <footer>
        <small>Public. The post author controls which replies appear here.</small>
        <button className="primary-button" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Publishing…" : "Publish reply"}
        </button>
      </footer>
    </form>
  );
}
