// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContactDialog } from "./ContactDialog";
afterEach(cleanup);
it("sends a contact request and keeps a failed request editable", async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error("Jolt is offline"))
    .mockResolvedValue(undefined);
  render(
    <ContactDialog requests={[]} requestedContacts={[]} onRequest={request} onDecide={vi.fn()} />
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /New conversation/ }));
  await user.type(screen.getByLabelText("Jolt identity"), "bob.jolt");
  await user.type(screen.getByLabelText("Name in your contacts"), "Bob");
  await user.click(screen.getByRole("button", { name: "Send request" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Jolt is offline");
  expect(screen.getByLabelText("Jolt identity")).toHaveValue("bob.jolt");
  await user.click(screen.getByRole("button", { name: "Send request" }));
  expect(await screen.findByText(/Request sent/)).toBeVisible();
  expect(request).toHaveBeenLastCalledWith({ identity: "bob.jolt", displayName: "Bob" });
});
it("accepts a request through its stable ingress ID", async () => {
  const decide = vi.fn().mockResolvedValue(undefined);
  render(
    <ContactDialog
      requests={[
        {
          ingressId: "verified",
          request: {
            schema: "spoke.follow_request.v1",
            id: "request",
            sender: "bob.jolt",
            recipient: "alice.jolt",
            displayName: "Bob",
            message: "Hello",
            createdAt: "today"
          }
        }
      ]}
      requestedContacts={[]}
      onRequest={vi.fn()}
      onDecide={decide}
    />
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /New conversation/ }));
  await user.click(screen.getByRole("button", { name: "Accept Bob" }));
  expect(decide).toHaveBeenCalledWith("verified", "accepted");
});
