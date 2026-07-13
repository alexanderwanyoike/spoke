import { ImageOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type MediaFrameProps = {
  src?: string;
  error?: string;
  alt: string;
  caption?: string;
  imageClassName?: string;
  className?: string;
  onError?: () => void;
  loadingLabel?: string;
  errorLabel?: string;
};

export function MediaFrame({
  src,
  error,
  alt,
  caption,
  imageClassName,
  className,
  onError,
  loadingLabel = "Loading image",
  errorLabel = "Image unavailable"
}: MediaFrameProps) {
  return (
    <figure className={cn("overflow-hidden rounded-lg border spoke-border bg-muted/30 shadow-inner", className)}>
      {src ? (
        <img className={cn("w-full object-cover", imageClassName)} src={src} alt={alt} onError={onError} />
      ) : error ? (
        <div className="grid min-h-32 place-items-center bg-muted/50 p-4 text-sm text-muted-foreground">
          <div className="grid place-items-center gap-2">
            <ImageOff className="size-5" />
            {errorLabel}
          </div>
        </div>
      ) : (
        <div className="grid min-h-32 place-items-center bg-muted/40 p-4 text-sm text-muted-foreground">
          <div className="grid place-items-center gap-2">
            <Loader2 className="size-5 animate-spin" />
            {loadingLabel}
          </div>
        </div>
      )}
      {caption ? <figcaption className="bg-background/70 px-3 py-2 text-xs text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}
