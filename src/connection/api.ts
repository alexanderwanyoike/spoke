import {
  checkSpokeCompatibility,
  getCurrentSession,
  getSessionRequestStatus,
  getStatus
} from "../jolt";
import { requestSpokeSession } from "../session";
export const sessionApi = {
  async check() {
    const result = await checkSpokeCompatibility();
    if (result.status !== "compatible")
      throw new Error("Update Jolt before connecting this version of Spoke.");
  },
  async identity() {
    return (await getStatus()).identity_address;
  },
  current: getCurrentSession,
  request: requestSpokeSession,
  poll: getSessionRequestStatus
};
export type SessionApi = typeof sessionApi;
