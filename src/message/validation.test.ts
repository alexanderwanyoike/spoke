import { expect, it } from "vitest";
import { decodeMessage } from "./model";
it("rejects malformed message bodies at the SDK boundary", () => {
  expect(decodeMessage({ schema: "spoke.message.v2", body: 5 })).toBeNull();
  expect(decodeMessage({ schema: "spoke.message.v1" })).toBeNull();
});
