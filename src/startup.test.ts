import { beforeEach, describe, expect, it, vi } from "vitest";
import { JoltApiError, JoltTransportError } from "jolt-sdk";

const checkSpokeCompatibility = vi.hoisted(() => vi.fn());

vi.mock("./jolt", () => ({
  SPOKE_COMPATIBILITY: {
    appApi: 1,
    requiredFeatures: {},
    optionalFeatures: {}
  },
  checkSpokeCompatibility
}));

import { enterSpokeRuntime } from "./startup";

describe("Spoke startup compatibility gate", () => {
  beforeEach(() => {
    checkSpokeCompatibility.mockReset();
  });

  it("enters the runtime only after compatibility is confirmed", async () => {
    const continueStartup = vi.fn(async () => undefined);
    checkSpokeCompatibility.mockResolvedValue({ status: "compatible" });

    await expect(enterSpokeRuntime(continueStartup)).resolves.toEqual({
      status: "compatible"
    });
    expect(continueStartup).toHaveBeenCalledOnce();
    expect(checkSpokeCompatibility.mock.invocationCallOrder[0]).toBeLessThan(
      continueStartup.mock.invocationCallOrder[0]
    );
  });

  it("does not enter the runtime when the installed Spoke build is incompatible", async () => {
    const continueStartup = vi.fn(async () => undefined);
    checkSpokeCompatibility.mockResolvedValue({ status: "incompatible" });

    await expect(enterSpokeRuntime(continueStartup)).resolves.toEqual({
      status: "incompatible"
    });
    expect(checkSpokeCompatibility).toHaveBeenCalledWith(
      {
        appApi: 1,
        requiredFeatures: {},
        optionalFeatures: {}
      },
      { refresh: true }
    );
    expect(continueStartup).not.toHaveBeenCalled();
  });

  it("reports an unavailable daemon without describing it as incompatible", async () => {
    const continueStartup = vi.fn(async () => undefined);
    checkSpokeCompatibility.mockRejectedValue(
      new JoltTransportError("Cannot reach the Jolt daemon")
    );

    await expect(enterSpokeRuntime(continueStartup)).resolves.toEqual({
      status: "unavailable"
    });
    expect(continueStartup).not.toHaveBeenCalled();
  });

  it("treats a failed web proxy as unavailable", async () => {
    const continueStartup = vi.fn(async () => undefined);
    checkSpokeCompatibility.mockRejectedValue(new JoltApiError("Bad gateway", { status: 502 }));

    await expect(enterSpokeRuntime(continueStartup)).resolves.toEqual({
      status: "unavailable"
    });
    expect(continueStartup).not.toHaveBeenCalled();
  });

  it("does not hide an unexpected TypeError as unavailable", async () => {
    const continueStartup = vi.fn(async () => undefined);
    checkSpokeCompatibility.mockRejectedValue(new TypeError("Application decoder bug"));

    await expect(enterSpokeRuntime(continueStartup)).rejects.toThrow("Application decoder bug");
    expect(continueStartup).not.toHaveBeenCalled();
  });
});
