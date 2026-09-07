import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiErrorMessage } from "../jolt";
import { PostInput } from "./input";
import type { ReadyPost } from "./post-document";
export function PostEditor({
  document,
  onSaved,
  onCancel
}: {
  document: ReadyPost;
  onSaved(document: ReadyPost): void;
  onCancel(): void;
}) {
  const { post } = document.item;
  const form = useForm<PostInput>({
    resolver: zodResolver(PostInput),
    defaultValues: {
      title: post.title,
      body: post.body,
      website: post.link?.url || "",
      linkTitle: post.link?.title || ""
    }
  });
  const submit = form.handleSubmit(async (input) => {
    if (!document.actions) return;
    try {
      onSaved(await document.actions.edit(input));
    } catch (cause) {
      form.setError("root", { message: apiErrorMessage(cause) });
    }
  });
  return (
    <form className="profile-form" onSubmit={submit}>
      <h2>Edit post</h2>
      <fieldset className="plain-fieldset" disabled={form.formState.isSubmitting}>
        <label className="field">
          <span>Post</span>
          <textarea rows={5} {...form.register("body")} />
        </label>
        <label className="field">
          <span>Title</span>
          <input {...form.register("title")} />
        </label>
        <label className="field">
          <span>Link address</span>
          <input {...form.register("website")} />
        </label>
        <label className="field">
          <span>Link title</span>
          <input {...form.register("linkTitle")} />
        </label>
        {Object.values(form.formState.errors).map((error, index) => (
          <p role="alert" key={index}>
            {error.message}
          </p>
        ))}
      </fieldset>
      <div className="form-actions">
        <button type="button" disabled={form.formState.isSubmitting} onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" disabled={form.formState.isSubmitting}>
          Save post
        </button>
      </div>
    </form>
  );
}
