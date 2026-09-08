import { useEffect, useState } from "react";
import { AVATAR_REFRESH_MS, type ProfileAvatars } from "./avatars";

export function useAvatarUrl(source: ProfileAvatars | null, identity: string) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!source) return;
    const load = source.load;
    let active = true;
    let currentBlob: Blob | null = null;
    let objectUrl = "";
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const blob = await load(identity);
      if (!active) return;
      if (blob !== currentBlob) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = blob ? URL.createObjectURL(blob) : "";
        currentBlob = blob;
        setUrl(objectUrl);
      }
      timer = setTimeout(() => void refresh(), AVATAR_REFRESH_MS);
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source, identity]);
  return url;
}
