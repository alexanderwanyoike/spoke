import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PendingImageAttachment } from "./types";

type AttachmentDraftRowProps = {
  attachment: PendingImageAttachment;
  formatBytes: (bytes: number) => string;
  onAltChange: (alt: string) => void;
  onRemove: () => void;
  imageClassName?: string;
};

export function AttachmentDraftRow({
  attachment,
  formatBytes,
  onAltChange,
  onRemove,
  imageClassName
}: AttachmentDraftRowProps) {
  return (
    <div className="grid gap-3 rounded-lg border spoke-border bg-muted/35 p-2 sm:grid-cols-[72px_1fr_auto]">
      <img
        className={cn("size-18 rounded-md object-cover shadow-sm", imageClassName)}
        src={attachment.previewUrl}
        alt={attachment.file.name}
      />
      <div className="grid gap-2">
        <strong className="truncate text-sm">{attachment.file.name || "Image attachment"}</strong>
        <span className="text-xs text-muted-foreground">
          {formatBytes(attachment.file.size)}
          {attachment.width && attachment.height
            ? ` - ${attachment.width}x${attachment.height}`
            : ""}
        </span>
        <Input value={attachment.alt} onChange={(event) => onAltChange(event.target.value)} placeholder="Alt text" />
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} title="Remove image">
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
