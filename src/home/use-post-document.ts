import { useEffect, useState } from "react";
import { apiErrorMessage } from "../jolt";
import type { HomeGateway } from "./gateway";
import { openPost, type PostDocument, type ReadyPost } from "./post-document";

export function usePostDocument(
  gateway: HomeGateway,
  identity: string,
  owner: string,
  postId: string
) {
  const [document, setDocument] = useState<PostDocument | null>(null);
  const [error, setError] = useState("");
  const [attempt, retry] = useState(0);
  const [undo, setUndo] = useState<(() => Promise<ReadyPost>) | null>(null);
  useEffect(() => {
    let active = true;
    setError("");
    void gateway
      .connect()
      .then((data) => openPost(data, identity, owner, postId))
      .then(
        (value) => {
          if (active) setDocument(value);
        },
        (cause) => {
          if (active) setError(apiErrorMessage(cause));
        }
      );
    return () => {
      active = false;
    };
  }, [gateway, identity, owner, postId, attempt]);
  function saved(next: ReadyPost) {
    setDocument(next);
    setError("");
  }
  async function restore() {
    if (!undo) return;
    try {
      saved(await undo());
      setUndo(null);
    } catch (cause) {
      setError(apiErrorMessage(cause));
    }
  }
  return {
    document,
    error,
    saved,
    restore,
    undo,
    retry: () => retry((value) => value + 1),
    deleted(restore: () => Promise<ReadyPost>) {
      setUndo(() => restore);
      setDocument({ kind: "deleted" });
    }
  };
}
