import { createProfileAvatars, ProfileAvatarsProvider } from "../profile";
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import "@testing-library/jest-dom/vitest";
import { PeoplePage } from "./PeoplePage";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("separates pending requests from contacts and filters by name or identity", async () => {
  render(
    <MemoryRouter>
      <PeoplePage
        identity="alice"
        contacts={[
          { identity: "bob", displayName: "Bob", relationship: "accepted" },
          { identity: "carol", displayName: "Carol", relationship: "requested" }
        ]}
        requests={[]}
        error=""
        loading={false}
        onRefresh={vi.fn()}
        onRequest={vi.fn()}
        onDecide={vi.fn()}
        profiles={{ load: vi.fn(), save: vi.fn() }}
      />
    </MemoryRouter>
  );
  expect(screen.getByRole("heading", { name: "Sent requests" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Message Bob" })).toHaveAttribute(
    "href",
    "/messages/conv_alice_bob"
  );
  expect(screen.queryByRole("link", { name: "Message Carol" })).not.toBeInTheDocument();
  await userEvent.type(screen.getByRole("searchbox", { name: "Find a person" }), "BOB");
  expect(screen.getByText("Bob")).toBeVisible();
  expect(screen.queryByText("Carol")).not.toBeInTheDocument();
});

it("looks up a profile and retains an introduction after a failed request", async () => {
  const profiles = {
    load: vi
      .fn()
      .mockResolvedValue({ profile: { displayName: "Bob", bio: "Hello" }, contentId: "profile" }),
    save: vi.fn()
  };
  const request = vi.fn().mockRejectedValue(new Error("Node unavailable"));
  render(
    <MemoryRouter>
      <PeoplePage
        identity="alice"
        contacts={[]}
        requests={[]}
        error=""
        loading={false}
        onRefresh={vi.fn()}
        onRequest={request}
        onDecide={vi.fn()}
        profiles={profiles}
      />
    </MemoryRouter>
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Find someone" }));
  await user.type(screen.getByRole("textbox", { name: "Jolt identity" }), "bob.jolt");
  await user.click(screen.getByRole("button", { name: "Look up identity" }));
  const introduction = await screen.findByRole("textbox", { name: "Introduction (optional)" });
  await user.type(introduction, "We met at the bookshop.");
  await user.click(screen.getByRole("button", { name: "Send request" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Node unavailable");
  expect(introduction).toHaveValue("We met at the bookshop.");
  expect(request).toHaveBeenCalledWith(
    expect.objectContaining({
      identity: "bob.jolt",
      displayName: "Bob",
      message: "We met at the bookshop."
    })
  );
});

it("shows a saved contact's public picture even when the contact already has a name", async () => {
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:malcom-avatar"),
    revokeObjectURL: vi.fn()
  });
  const avatar = {
    id: "portrait",
    kind: "image" as const,
    contentId: "portrait-cid",
    address: "malcom.jolt/spoke/media/portrait",
    mimeType: "image/png" as const,
    size: 20
  };
  const profiles = {
    load: vi.fn().mockResolvedValue({
      contentId: "profile-cid",
      profile: {
        schema: "spoke.profile.v2",
        identity: "malcom.jolt",
        displayName: "Malcom",
        bio: "",
        updatedAt: "2026-09-08T00:00:00Z",
        avatar
      }
    }),
    save: vi.fn(),
    images: { load: vi.fn().mockResolvedValue(new Blob(["portrait"])), upload: vi.fn() }
  };
  render(
    <MemoryRouter>
      <ProfileAvatarsProvider source={createProfileAvatars(profiles)}>
        <PeoplePage
          identity="alex.jolt"
          contacts={[{ identity: "malcom.jolt", displayName: "Malcom", relationship: "accepted" }]}
          requests={[]}
          error=""
          loading={false}
          profiles={profiles}
          onRefresh={vi.fn()}
          onRequest={vi.fn()}
          onDecide={vi.fn()}
        />
      </ProfileAvatarsProvider>
    </MemoryRouter>
  );
  expect(await screen.findByAltText("Malcom profile picture")).toHaveAttribute(
    "src",
    "blob:malcom-avatar"
  );
  expect(profiles.images.load).toHaveBeenCalledWith(avatar);
});
