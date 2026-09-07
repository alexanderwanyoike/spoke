import { PhotoDraft } from "./PhotoDraft";
import type { usePostForm } from "./use-post-form";
export function PostForm({ controller }: { controller: ReturnType<typeof usePostForm> }) {
  const { form, gallery, submit, addPhotos, pending } = controller;
  return (
    <form onSubmit={submit}>
      <fieldset className="plain-fieldset" disabled={pending}>
        <label className="field">
          <span>Post</span>
          <textarea
            autoFocus
            rows={5}
            placeholder="What would you like to share?"
            {...form.register("body")}
          />
        </label>
        {form.formState.errors.body && <p role="alert">{form.formState.errors.body.message}</p>}
        <label className="field">
          <span>Images (optional)</span>
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              addPhotos(Array.from(event.target.files || []));
              event.target.value = "";
            }}
          />
        </label>
        {gallery.photos.map((photo, index) => (
          <PhotoDraft
            key={`${photo.file.name}-${index}`}
            photo={photo}
            onAlt={(alt) => gallery.describe(index, alt)}
            onRemove={() => gallery.remove(index)}
            onMove={(direction) => gallery.move(index, direction)}
          />
        ))}
        <details className="post-extras">
          <summary>Add a title or link</summary>
          <label className="field">
            <span>Title (optional)</span>
            <input {...form.register("title")} />
          </label>
          <label className="field">
            <span>Link address</span>
            <input {...form.register("website")} placeholder="https://" />
          </label>
          <label className="field">
            <span>Link title</span>
            <input {...form.register("linkTitle")} />
          </label>
        </details>
        {form.formState.errors.website && (
          <p role="alert">{form.formState.errors.website.message}</p>
        )}
        {form.formState.errors.title && <p role="alert">{form.formState.errors.title.message}</p>}
        {form.formState.errors.linkTitle && (
          <p role="alert">{form.formState.errors.linkTitle.message}</p>
        )}
      </fieldset>
      {form.formState.errors.root && <p role="alert">{form.formState.errors.root.message}</p>}
      <div className="form-actions">
        <span className="subtle">Public post</span>
        <button className="primary-button" disabled={pending}>
          Publish post
        </button>
      </div>
    </form>
  );
}
