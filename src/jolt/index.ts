// Jolt SDK / ACL seam.
//
// This is the pure transport + protocol boundary. It knows nothing about Spoke
// social concepts (profiles, posts, replies, threads). It exposes References
// and versioned publish/read primitives; everything social lives above it in
// the command/query layer. See docs/CONTEXT.md ("Jolt SDK / ACL") and the epic
// in docs/cards/100-spoke-architecture-refactor-epic.md.

import {
  decodeFetchData,
  fetchTarget,
  publishJson as transportPublishJson,
  resolveAddress,
  type PublishResponse
} from "../api";

// The stable identity of a publication: (identity, path), versioned by Jolt's
// latest_sequence. The store keys everything by Reference.
export type Reference = {
  identity: string;
  path: string;
};

export type PublishResult = {
  contentId: string;
  latestSequence: number;
  path: string;
  address: string | null;
};

// A decoder is the domain's schema-level reader: it validates/normalizes an
// already-parsed JSON value into a canonical type, or returns null. It knows
// nothing about bytes or transport - that is the ACL's job.
export type Decoder<T> = (value: unknown) => T | null;

// A versioned, decoded publication: what a read hands back to the domain.
export type Versioned<T> = {
  ref: Reference;
  value: T;
  latestSequence: number;
  contentId: string;
};

// The fakeable adapter. Commands and queries depend on this interface, never on
// the concrete transport, so the domain layer is testable with a plain object.
// The ACL owns marshalling: publishJson serializes, and read deserializes +
// validates through the caller's Decoder so the domain never touches bytes.
export interface JoltSdk {
  publishJson(path: string, body: object): Promise<PublishResult>;
  // Resolves, fetches, parses, and decodes. Returns null when the reference is
  // missing/unreachable or the bytes do not decode to T.
  read<T>(ref: Reference, decode: Decoder<T>): Promise<Versioned<T> | null>;
}

export function referenceKey(ref: Reference): string {
  return `${ref.identity}\u0000${ref.path}`;
}

export function referenceTarget(ref: Reference): string {
  return `${ref.identity}${ref.path}`;
}

function toPublishResult(response: PublishResponse, path: string): PublishResult {
  return {
    contentId: response.content_id,
    latestSequence: response.latest_sequence ?? 0,
    path: response.path ?? path,
    address: response.address ?? null
  };
}

export function createJoltSdk(getSessionToken: () => string): JoltSdk {
  return {
    async publishJson(path, body) {
      const response = await transportPublishJson(getSessionToken(), path, body);
      return toPublishResult(response, path);
    },
    async read(ref, decode) {
      const token = getSessionToken();
      let resolved;
      let fetched;
      try {
        // Resolve first so the store gets a real latest_sequence to version by,
        // then fetch the content-addressed bytes.
        resolved = await resolveAddress(token, referenceTarget(ref));
        fetched = await fetchTarget(token, resolved.content_id);
      } catch {
        return null; // missing or unreachable
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(decodeFetchData(fetched));
      } catch {
        return null; // unparseable bytes never poison a Projection
      }
      const value = decode(parsed);
      if (value === null) {
        return null;
      }
      return {
        ref,
        value,
        latestSequence: resolved.latest_sequence,
        contentId: resolved.content_id
      };
    }
  };
}
