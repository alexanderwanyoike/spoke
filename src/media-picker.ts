// Native image picker. On desktop we open the OS file dialog through
// tauri-plugin-dialog so the user gets their system's native chooser, with
// image thumbnails/previews, instead of WebKit's bare HTML <input> chooser.
// The picked paths are read back as bytes (read_picked_image) and rebuilt into
// browser File objects, so the rest of the attachment pipeline is unchanged.
// On the web build there is no native dialog; callers fall back to <input>.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export const IMAGE_PICKER_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

type PickedImage = { name: string; mimeType: string; bytes: number[] };

export function canUseNativeImagePicker() {
  const internals =
    typeof window === "undefined"
      ? null
      : (window as typeof window & {
          __TAURI_INTERNALS__?: { invoke?: unknown };
        }).__TAURI_INTERNALS__;
  return isTauri() || typeof internals?.invoke === "function";
}

// Open the native image dialog and return the chosen files. Returns [] when the
// user cancels.
export async function pickNativeImageFiles(options: { multiple: boolean }): Promise<File[]> {
  const selection = await open({
    multiple: options.multiple,
    directory: false,
    filters: [{ name: "Images", extensions: IMAGE_PICKER_EXTENSIONS }]
  });
  if (selection == null) {
    return [];
  }

  const paths = (Array.isArray(selection) ? selection : [selection]).map((entry) =>
    typeof entry === "string" ? entry : entry.path
  );
  return Promise.all(
    paths.map(async (path) => {
      const picked = await invoke<PickedImage>("read_picked_image", { path });
      return new File([new Uint8Array(picked.bytes)], picked.name, { type: picked.mimeType });
    })
  );
}
