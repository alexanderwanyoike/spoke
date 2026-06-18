// Jolt SDK / ACL seam.
//
// This is the pure transport + protocol boundary. It knows nothing about Spoke
// social concepts (profiles, posts, replies, threads). It exposes References
// and versioned publish/read primitives; everything social lives above it in
// the command/query layer. See docs/CONTEXT.md ("Jolt SDK / ACL") and the epic
// in docs/cards/100-spoke-architecture-refactor-epic.md.

import {
  acceptIngress as transportAcceptIngress,
  decodePlaintext,
  decryptEncryptedTarget,
  fetchTarget,
  listPendingIngress as transportListPendingIngress,
  listPublished as transportListPublished,
  openIngress as transportOpenIngress,
  publishEncryptedJson as transportPublishEncryptedJson,
  publishJson as transportPublishJson,
  rejectIngress as transportRejectIngress,
  resolveAddress,
  sendObjectByIdentity,
  type IngressRecord,
  type PublishedContent,
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

// Encrypted publish/read primitives. Separate from the public JoltSdk so a
// feature only depends on the capability it uses (and existing public-only test
// fakes keep satisfying JoltSdk). The contact graph (ADR 0004) and the message
// outbox publish encrypted; createJoltSdk implements this alongside JoltSdk.
export interface JoltEncryptedSdk {
  // Publish a JSON body encrypted to the given recipients. Use [self] for an
  // encrypt-to-self publication (the contact graph). The publisher can always
  // decrypt its own publications, so readEncrypted reads them back.
  publishEncryptedJson(
    path: string,
    body: object,
    recipients: string[]
  ): Promise<PublishResult>;
  // Resolve + decrypt + parse + decode an encrypted publication. Returns null
  // when missing/unreachable or the plaintext does not decode to T.
  readEncrypted<T>(ref: Reference, decode: Decoder<T>): Promise<Versioned<T> | null>;
  // The local node's published inventory, used to enumerate a locally-owned
  // Collection (e.g. the contact graph and the message outbox) pre-J1.
  listPublished(): Promise<PublishedContent[]>;
}

// The recipient-controlled ingress door: send an identified object to a
// recipient, and review pending ingress. Pure transport in Jolt's own
// vocabulary - it knows nothing about follows, messages, or replies; Spoke's
// inbox seam classifies the payloads.
export interface JoltIngressSdk {
  // Encrypt-publish the object at `path` (the sender's own copy) and ingress-send
  // it to the recipient. Returns the publish result so the sender can fold its
  // own copy into the store with a version.
  sendObject(recipient: string, path: string, body: object): Promise<PublishResult>;
  listPendingIngress(): Promise<IngressRecord[]>;
  // Open (decrypt) a pending ingress record and return its parsed JSON payload,
  // or null when it cannot be decrypted/parsed.
  openIngress(ingressId: string): Promise<unknown>;
  acceptIngress(ingressId: string): Promise<void>;
  rejectIngress(ingressId: string): Promise<void>;
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

export function createJoltSdk(
  getSessionToken: () => string
): JoltSdk & JoltEncryptedSdk & JoltIngressSdk {
  // Resolve a reference, hand the content-addressed plaintext bytes to `getBytes`
  // (a plain fetch for public publications, a decrypt for encrypted ones), then
  // parse + decode. Returns null on any missing/unreachable/undecodable step so
  // a bad object never poisons a Projection (tolerant readers).
  async function resolveDecode<T>(
    ref: Reference,
    getBytes: (token: string, contentId: string) => Promise<number[]>,
    decode: Decoder<T>
  ): Promise<Versioned<T> | null> {
    const token = getSessionToken();
    let resolved;
    let bytes: number[];
    try {
      resolved = await resolveAddress(token, referenceTarget(ref));
      bytes = await getBytes(token, resolved.content_id);
    } catch {
      return null; // missing or unreachable
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));
    } catch {
      return null; // unparseable bytes never poison a Projection
    }
    const value = decode(parsed);
    if (value === null) {
      return null;
    }
    return { ref, value, latestSequence: resolved.latest_sequence, contentId: resolved.content_id };
  }

  return {
    async publishJson(path, body) {
      const response = await transportPublishJson(getSessionToken(), path, body);
      return toPublishResult(response, path);
    },
    async read(ref, decode) {
      return resolveDecode(
        ref,
        async (token, contentId) => (await fetchTarget(token, contentId)).data,
        decode
      );
    },
    async publishEncryptedJson(path, body, recipients) {
      const response = await transportPublishEncryptedJson(
        getSessionToken(),
        path,
        body,
        recipients
      );
      return toPublishResult(response, path);
    },
    async readEncrypted(ref, decode) {
      return resolveDecode(
        ref,
        async (token, contentId) => (await decryptEncryptedTarget(token, contentId)).plaintext,
        decode
      );
    },
    async listPublished() {
      return transportListPublished(getSessionToken());
    },
    async sendObject(recipient, path, body) {
      const { encryptedPublish } = await sendObjectByIdentity(
        getSessionToken(),
        recipient,
        path,
        body
      );
      return toPublishResult(encryptedPublish, path);
    },
    async listPendingIngress() {
      return transportListPendingIngress(getSessionToken());
    },
    async openIngress(ingressId) {
      const opened = await transportOpenIngress(getSessionToken(), ingressId);
      try {
        return JSON.parse(decodePlaintext(opened)) as unknown;
      } catch {
        return null;
      }
    },
    async acceptIngress(ingressId) {
      await transportAcceptIngress(getSessionToken(), ingressId);
    },
    async rejectIngress(ingressId) {
      await transportRejectIngress(getSessionToken(), ingressId);
    }
  };
}
