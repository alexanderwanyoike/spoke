import { expect, it } from "vitest";
import { operations } from "jolt-sdk";
import { participant } from "./participant";
import { createProfileRepository } from "../../src/profile/repository";
import { createPublicImages } from "../../src/media/public";
import { createProfileNames } from "../../src/profile/names";
import { normalizeIdentity } from "../../src/follow";

it.skipIf(process.env.SPOKE_INTEGRATION !== "1")(
  "publishes, updates and remotely reads a profile and its public picture",
  async () => {
    const alice = await participant(Number(process.env.SPOKE_ALICE_PORT));
    const bob = await participant(Number(process.env.SPOKE_BOB_PORT));
    const images = createPublicImages(alice.token, {
      publish: async (token, path, file, options) =>
        operations.publishBytes(
          alice.sdk.transport,
          token,
          path,
          new Uint8Array(await file.arrayBuffer()),
          options
        ),
      fetch: (token, target) => operations.fetchTarget(alice.sdk.transport, token, target)
    });
    const profiles = createProfileRepository(alice.identity, alice.sdk, images);
    const initial = await profiles.load(alice.identity);
    const input = {
      displayName: "Alice",
      bio: "Integration profile",
      location: "",
      pronouns: "",
      website: "https://example.com"
    };
    const saved = await profiles.save(input, initial.contentId);
    expect(
      (await createProfileRepository(bob.identity, bob.sdk).load(alice.identity)).profile
        ?.displayName
    ).toBe("Alice");
    expect(
      (await createProfileNames(bob.sdk).load([alice.identity])).get(
        normalizeIdentity(alice.identity)
      )
    ).toBe("Alice");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1cAAAAASUVORK5CYII=",
      "base64"
    );
    const photo = new File([png], "portrait.png", { type: "image/png" });
    const updated = await profiles.save(
      { ...input, displayName: "Alice Jones" },
      saved.contentId,
      photo
    );
    expect(updated.profile?.displayName).toBe("Alice Jones");
    expect(Buffer.from(await (await images.load(updated.profile!.avatar!)).arrayBuffer())).toEqual(
      png
    );
    await expect(profiles.save(input, saved.contentId)).rejects.toThrow(/changed/);
  },
  120_000
);
