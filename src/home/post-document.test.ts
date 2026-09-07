import { expect, it } from "vitest";
import { State } from "jolt-sdk/data";
import { SpokeData } from "../data";
import { openPost } from "./post-document";
it("edits, removes and restores an owned post using its observed SDK item", async () => {
  const data = SpokeData.test({ identity: "alice.jolt" });
  const saved = await data.posts.create({
    author: "alice.jolt",
    title: "",
    body: "Original",
    createdAt: new Date()
  });
  const document = await openPost(
    data,
    "alice.jolt",
    "alice.jolt",
    saved.ref.path.split("/").pop()!
  );
  if (document.kind !== "ready" || !document.actions) throw new Error("Expected owned post");
  const edited = await document.actions.edit({
    title: "",
    body: "Edited",
    website: "",
    linkTitle: ""
  });
  expect(edited.item.post.body).toBe("Edited");
  const undo = await edited.actions!.remove();
  expect((await data.posts.get(saved.ref)).state).toBe(State.Deleted);
  await undo();
  expect((await data.posts.get(saved.ref)).state).toBe(State.Present);
});
