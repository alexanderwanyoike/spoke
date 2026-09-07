import { SpokeData, type SpokeApp } from "../data";
import { createJoltDataClient } from "../jolt";
import { createPublicImages, type PublicImages } from "../media/public";
export interface HomeGateway {
  connect(): Promise<SpokeApp>;
  images: PublicImages;
}
export function createHomeGateway(token: string, identity: string): HomeGateway {
  let pending: Promise<SpokeApp> | null = null;
  return {
    images: createPublicImages(token),
    connect() {
      pending ??= SpokeData.connect({ identity, client: createJoltDataClient(() => token) }).catch(
        (error) => {
          pending = null;
          throw error;
        }
      );
      return pending;
    }
  };
}
