import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { PostForm } from "./PostForm";
import { usePostForm, type PublishPost } from "./use-post-form";
export function Composer({ onPublish, onClose }: { onPublish: PublishPost; onClose(): void }) {
  const controller = usePostForm(onPublish, onClose);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !controller.pending) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="contact-overlay" />
        <Dialog.Content className="contact-dialog post-dialog">
          <Dialog.Title>New post</Dialog.Title>
          <Dialog.Description>
            A little of your world. Posts and attachments are public.
          </Dialog.Description>
          <Dialog.Close
            disabled={controller.pending}
            className="icon-button dialog-close"
            aria-label="Close composer"
          >
            <X size={19} />
          </Dialog.Close>
          <PostForm controller={controller} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
