import type { ChangeEvent, ReactNode } from "react";
import { useRef } from "react";
import type { VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";
import { canUseNativeImagePicker, pickNativeImageFiles } from "@/media-picker";

type ImagePickerButtonProps = VariantProps<typeof buttonVariants> & {
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  onError?: (message: string) => void;
  title?: string;
  className?: string;
  children: ReactNode;
};

// A button that opens an image picker. On desktop it uses the native OS dialog
// (with thumbnails/previews); on the web it falls back to a hidden <input>.
// Either way it hands the chosen File objects to onFiles.
export function ImagePickerButton({
  multiple = false,
  onFiles,
  onError,
  title,
  className,
  variant = "outline",
  size,
  children
}: ImagePickerButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleClick() {
    if (canUseNativeImagePicker()) {
      try {
        const files = await pickNativeImageFiles({ multiple });
        if (files.length > 0) {
          onFiles(files);
        }
      } catch (error) {
        onError?.(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    inputRef.current?.click();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length > 0) {
      onFiles(files);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      title={title}
      className={className}
      onClick={handleClick}
    >
      {children}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        onChange={handleInputChange}
      />
    </Button>
  );
}
