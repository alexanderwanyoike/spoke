// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SpokeData } from "../data";
import { createProfileAvatars } from "../profile";
import { conversation, gatewayFixture } from "../test/messages";
import App from "./App";

const { runtime } = vi.hoisted(() => ({ runtime: vi.fn() }));
vi.mock("./runtime", () => ({ createRuntime: runtime }));
vi.mock("../connection", () => ({
  ConnectionBoundary: ({ children }: { children: (session: unknown) => unknown }) =>
    children({ identity: "alex.jolt", token: "session", disconnect: vi.fn() })
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

it.each<[string, number]>([
  ["/messages/conv_alice_malcom.jolt", 2],
  ["/home", 1],
  ["/people", 1]
])(
  "renders a named contact's public picture through the application at %s",
  async (route, count) => {
    localStorage.setItem("spoke.appearance", "light");
    vi.stubGlobal(
      "URL",
      class extends URL {
        static createObjectURL = vi.fn(() => "blob:malcom-avatar");
        static revokeObjectURL = vi.fn();
      }
    );
    const data = SpokeData.test({ identity: "malcom.jolt" });
    await data.posts.create({
      author: "malcom.jolt",
      displayName: "Malcom",
      body: "Hello Alex",
      title: "",
      createdAt: new Date()
    });
    const avatar = {
      id: "portrait",
      kind: "image" as const,
      contentId: "portrait-cid",
      mimeType: "image/png" as const,
      size: 20
    };
    const images = { load: vi.fn().mockResolvedValue(new Blob(["portrait"])), upload: vi.fn() };
    const profiles = {
      load: vi.fn().mockImplementation(async (identity: string) => ({
        contentId: "profile-cid",
        profile:
          identity === "malcom.jolt"
            ? {
                schema: "spoke.profile.v2",
                identity,
                displayName: "Malcom",
                bio: "",
                updatedAt: "2026-09-08T00:00:00Z",
                avatar
              }
            : null
      })),
      save: vi.fn(),
      images
    };
    runtime.mockReturnValue({
      home: { connect: async () => data, images },
      messages: gatewayFixture([conversation("malcom.jolt", "Malcom")]).gateway,
      profile: { load: async () => "Alex" },
      profiles,
      avatars: createProfileAvatars(profiles)
    });
    window.location.hash = route;
    render(<App />);
    const pictures = await screen.findAllByAltText("Malcom profile picture");
    expect(pictures).toHaveLength(count);
    pictures.forEach((picture) => expect(picture).toHaveAttribute("src", "blob:malcom-avatar"));
    expect(images.load).toHaveBeenCalledExactlyOnceWith(avatar);
  }
);
