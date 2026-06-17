import { describe, expect, it, vi } from "vitest";
import { publishBeforeAcceptingIngress } from "./incoming";

describe("incoming object handling", () => {
  it("publishes the local copy before accepting ingress", async () => {
    const calls: string[] = [];
    const publishLocalCopy = vi.fn(async () => {
      calls.push("publish");
    });
    const acceptIngress = vi.fn(async () => {
      calls.push("accept");
    });

    await publishBeforeAcceptingIngress({ publishLocalCopy, acceptIngress });

    expect(calls).toEqual(["publish", "accept"]);
  });

  it("does not accept ingress when local publish fails", async () => {
    const publishLocalCopy = vi.fn(async () => {
      throw new Error("publish failed");
    });
    const acceptIngress = vi.fn(async () => {});

    await expect(
      publishBeforeAcceptingIngress({ publishLocalCopy, acceptIngress })
    ).rejects.toThrow("publish failed");

    expect(acceptIngress).not.toHaveBeenCalled();
  });
});

