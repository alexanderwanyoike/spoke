import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiErrorMessage } from "../jolt";
import { PostInput, type PostPhoto } from "./input";
import { usePostPhotos } from "./use-post-photos";
export type PublishPost = (input: PostInput, photos: PostPhoto[]) => Promise<void>;
export function usePostForm(publish: PublishPost, close: () => void) {
  const gallery = usePostPhotos();
  const form = useForm<PostInput>({
    resolver: zodResolver(PostInput),
    defaultValues: { body: "", title: "", website: "", linkTitle: "" }
  });
  const submit = form.handleSubmit(async (input) => {
    if (!input.body && !input.website && !gallery.photos.length) {
      form.setError("root", { message: "Write something, add an image or share a link." });
      return;
    }
    try {
      await publish(input, gallery.photos);
      close();
    } catch (cause) {
      form.setError("root", { message: apiErrorMessage(cause) });
    }
  });
  function addPhotos(files: File[]) {
    try {
      gallery.add(files);
      form.clearErrors("root");
    } catch (cause) {
      form.setError("root", { message: apiErrorMessage(cause) });
    }
  }
  return { form, gallery, submit, addPhotos, pending: form.formState.isSubmitting };
}
