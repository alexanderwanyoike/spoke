import { useCallback, useEffect, useState } from "react";
import { apiErrorMessage } from "../jolt";
import type { Reply } from "./contracts";
import type { ReplyThread } from "./tree";
import type { ReplyRepository } from "./repository";
export function useReplyThread(
  repository: ReplyRepository,
  identity: string,
  owner: string,
  postId: string
) {
  const [thread, setThread] = useState<ReplyThread | null>(null);
  const [submitted, setSubmitted] = useState<Reply[]>([]);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const [next, own] = await Promise.all([
          repository.load(owner, postId),
          repository.submitted(identity, owner, postId)
        ]);
        if (!active) return;
        setThread(next);
        setSubmitted(
          own.filter((reply) => !next.replies.some((visible) => visible.id === reply.id))
        );
        setError("");
      } catch (cause) {
        if (active) setError(apiErrorMessage(cause));
      } finally {
        if (active) timer = setTimeout(() => void load(), 10000);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [repository, identity, owner, postId, attempt]);
  return { thread, submitted, error, refresh };
}
