import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  Inbox,
  KeyRound,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  UserCheck,
  UserPlus,
  X
} from "lucide-react";
import {
  SPOKE_CAPABILITIES,
  acceptIngress,
  apiErrorMessage,
  decodeFetchData,
  decodePlaintext,
  decryptEncryptedTarget,
  fetchTarget,
  getCurrentSession,
  getSessionRequestStatus,
  getStatus,
  listPendingIngress,
  listPublished,
  makeId,
  makePostPath,
  makeReplyPath,
  openIngress,
  parseJsonBytes,
  publishJson,
  publishPostWithIndex,
  publishProfile,
  rejectIngress,
  requestSpokeSession,
  submitFollowRequestByIdentity,
  submitFollowResponseByIdentity,
  submitReplyByIdentity,
  type AppSessionStatus,
  type IngressRecord,
  type NodeStatus,
  type PublishedContent,
  type SpokeFeedIndex,
  type SpokePost,
  type SpokeProfile,
  type SpokeReply
} from "./api";
import {
  addOptimisticLocalPost,
  displayNameForFeedItem,
  isFeedItem,
  latestPublishedByPath,
  localPostReferences,
  mergeFeedSnapshot,
  mergeLocalFeedSnapshot,
  removeContactFeedItems,
  withLocalContentIds,
  activeContacts,
  type Contact,
  type FeedItem
} from "./feed";
import {
  acceptedContactFromRequest,
  applyFollowResponse,
  hasAcceptedContactForIdentity,
  hasRequestedContactForResponse,
  isSpokeFollowRequest,
  isSpokeFollowResponse,
  requestContactFromDraft,
  sameIdentity,
  upsertContact,
  type SpokeFollowRequest,
  type SpokeFollowResponse
} from "./follow";
import { addReplyToPost, type RepliesByPost } from "./thread";
import {
  tauriSpokeUpdateClient,
  type SpokeUpdateCheck,
  type SpokeUpdateClient
} from "./update/client";
type StoredSession = {
  requestId: string;
  token?: string | null;
  identity?: string | null;
  status: AppSessionStatus;
};

type ReviewState = {
  [ingressId: string]: {
    loading: boolean;
    opened?: SpokeIncomingPayload;
    error?: string;
  };
};

type SpokeIncomingPayload = SpokeReply | SpokeFollowRequest | SpokeFollowResponse;

const SESSION_KEY = "spoke.session";
const CONTACTS_KEY = "spoke.contacts";
const PROFILE_KEY = "spoke.profile";
const FEED_REFRESH_MS = 2000;
const INCOMING_REFRESH_MS = 2000;

function loadJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

function displayIdentity(identity?: string | null) {
  return identity || "No identity";
}

function hasRequiredCapabilities(granted: string[]) {
  return SPOKE_CAPABILITIES.every((capability) => granted.includes(capability));
}

function isAlreadyHandledIngressError(err: unknown) {
  return err instanceof Error && err.message.includes("ingress envelope is not pending");
}

function isSpokeReply(value: unknown): value is SpokeReply {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { schema?: unknown }).schema === "spoke.reply.v1"
  );
}

function incomingKind(payload: SpokeIncomingPayload) {
  if (isSpokeFollowRequest(payload)) return "follow request";
  if (isSpokeFollowResponse(payload)) return "follow response";
  return "reply";
}

function incomingPreview(payload: SpokeIncomingPayload) {
  if (isSpokeFollowRequest(payload)) {
    return payload.message || `${payload.sender} wants to follow you.`;
  }
  if (isSpokeFollowResponse(payload)) {
    return `${payload.sender} ${payload.decision} your follow request.`;
  }
  return payload.body;
}

function parseIncomingPayload(bytes: number[]) {
  const payload = parseJsonBytes<unknown>(bytes);
  if (isSpokeReply(payload) || isSpokeFollowRequest(payload) || isSpokeFollowResponse(payload)) {
    return payload;
  }
  throw new Error("Unsupported Spoke incoming object.");
}

function App() {
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [session, setSession] = useState<StoredSession>(() =>
    loadJson<StoredSession>(SESSION_KEY, { requestId: "", status: "pending" })
  );
  const [contacts, setContacts] = useState<Contact[]>(() => loadJson<Contact[]>(CONTACTS_KEY, []));
  const [profileDraft, setProfileDraft] = useState(() =>
    loadJson<Pick<SpokeProfile, "displayName" | "bio">>(PROFILE_KEY, {
      displayName: "",
      bio: ""
    })
  );
  const [contactDraft, setContactDraft] = useState<Contact>({
    identity: "",
    displayName: ""
  });
  const [followMessageDraft, setFollowMessageDraft] = useState("");
  const [postDraft, setPostDraft] = useState({ title: "", body: "" });
  const [feedIndex, setFeedIndex] = useState<SpokeFeedIndex | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [repliesByPost, setRepliesByPost] = useState<RepliesByPost>({});
  const [incoming, setIncoming] = useState<IngressRecord[]>([]);
  const [review, setReview] = useState<ReviewState>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updateCheck, setUpdateCheck] = useState<SpokeUpdateCheck | null>(null);
  const [updateAction, setUpdateAction] = useState<"check" | "install" | null>(null);
  const [sessionValidated, setSessionValidated] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const feedRefreshInFlight = useRef(false);
  const incomingRefreshInFlight = useRef(false);
  const feedRefreshGeneration = useRef(0);
  const contactsRef = useRef<Contact[]>(contacts);
  const updateClient: SpokeUpdateClient = tauriSpokeUpdateClient;

  const sessionToken = session.token || "";
  const localIdentity = session.identity || status?.identity_address || "";
  const canUseApp = Boolean(sessionToken && session.status === "active" && sessionValidated);

  const localPosts = useMemo(
    () => feed.filter((item) => item.source === "local").length,
    [feed]
  );
  const activeContactCount = useMemo(() => activeContacts(contacts).length, [contacts]);
  const displayNameForIdentity = (identity: string) => {
    if (sameIdentity(identity, localIdentity)) {
      return profileDraft.displayName.trim() || localIdentity;
    }
    return contacts.find((contact) => sameIdentity(contact.identity, identity))?.displayName || identity;
  };

  useEffect(() => {
    getStatus()
      .then(setStatus)
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  useEffect(() => {
    contactsRef.current = contacts;
    saveJson(CONTACTS_KEY, contacts);
  }, [contacts]);

  useEffect(() => {
    saveJson(PROFILE_KEY, profileDraft);
  }, [profileDraft]);

  useEffect(() => {
    saveJson(SESSION_KEY, session);
  }, [session]);

  useEffect(() => {
    if (!sessionToken || session.status !== "active") {
      setSessionValidated(false);
      return;
    }

    setSessionValidated(false);
    getCurrentSession(sessionToken)
      .then((current) => {
        if (!hasRequiredCapabilities(current.granted_capabilities)) {
          setSession({ requestId: "", status: "expired", identity: current.identity });
          setNotice("Spoke needs updated Jolt access. Request access again.");
          return;
        }
        setSessionValidated(true);
      })
      .catch((err) => {
        setSession({ requestId: "", status: "expired", identity: session.identity });
        setError(apiErrorMessage(err));
      });
  }, [sessionToken, session.status]);

  useEffect(() => {
    if (!session.requestId || session.status === "active") {
      return;
    }

    const timer = window.setInterval(() => {
      getSessionRequestStatus(session.requestId)
        .then((next) => {
          setSession({
            requestId: next.request_id,
            token: next.session_token,
            identity: next.identity,
            status: next.status
          });
          if (next.status === "active") {
            setSessionValidated(false);
            setNotice("Spoke session approved.");
          }
        })
        .catch((err) => setError(apiErrorMessage(err)));
    }, 1500);

    return () => window.clearInterval(timer);
  }, [session.requestId, session.status]);

  async function withBusy(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy("");
    }
  }

  async function checkSpokeUpdate() {
    setUpdateAction("check");
    setError("");
    try {
      const nextUpdateCheck = await updateClient.check();
      setUpdateCheck(nextUpdateCheck);
      setNotice(
        nextUpdateCheck.available
          ? `Update available: ${nextUpdateCheck.version}`
          : "Spoke is up to date."
      );
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUpdateAction(null);
    }
  }

  async function installSpokeUpdate() {
    setUpdateAction("install");
    setError("");
    try {
      await updateClient.installAndRelaunch();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUpdateAction(null);
    }
  }

  async function requestSession() {
    await withBusy("session", async () => {
      const identity = localIdentity || status?.identity_address || "";
      const requested = await requestSpokeSession(identity);
      setSession({ requestId: requested.request_id, status: requested.status, identity });
      setNotice("Approve Spoke in Jolt Console to continue.");
    });
  }

  async function refreshSession() {
    if (!sessionToken) {
      return;
    }

    await withBusy("session", async () => {
      setSessionValidated(false);
      const current = await getCurrentSession(sessionToken);
      if (!hasRequiredCapabilities(current.granted_capabilities)) {
        setSession({ requestId: "", status: "expired", identity: current.identity });
        setNotice("Spoke needs updated Jolt access. Request access again.");
        return;
      }
      setSession({
        requestId: current.request_id,
        token: sessionToken,
        identity: current.identity,
        status: current.status
      });
      setSessionValidated(current.status === "active");
    });
  }

  async function publishProfileFromDraft() {
    await withBusy("profile", async () => {
      const profile: SpokeProfile = {
        schema: "spoke.profile.v1",
        identity: localIdentity,
        displayName: profileDraft.displayName.trim() || localIdentity,
        bio: profileDraft.bio.trim(),
        updatedAt: new Date().toISOString()
      };
      await publishProfile(sessionToken, profile);
      setNotice("Profile published at /spoke/profile.");
    });
  }

  async function fetchPublishedJson<T>(contentId: string) {
    const result = await fetchTarget(sessionToken, contentId);
    return JSON.parse(decodeFetchData(result)) as T;
  }

  async function loadLocalFeed(published?: PublishedContent[]) {
    let index: SpokeFeedIndex | null = null;
    try {
      const inventory = published || await listPublished(sessionToken);
      const feedObject = latestPublishedByPath(inventory, "/spoke/feed");
      index = feedObject
        ? withLocalContentIds(
            await fetchPublishedJson<SpokeFeedIndex>(feedObject.content_id),
            inventory
          )
        : null;
    } catch {
      index = feedIndex;
    }
    setFeedIndex(index);
    return index;
  }

  async function publishPost() {
    await withBusy("post", async () => {
      const title = postDraft.title.trim();
      const body = postDraft.body.trim();
      if (!title || !body) {
        throw new Error("A Spoke post needs a title and body.");
      }

      const id = makeId("post");
      const post: SpokePost = {
        schema: "spoke.post.v1",
        id,
        author: localIdentity,
        displayName: profileDraft.displayName.trim() || localIdentity,
        title,
        body,
        createdAt: new Date().toISOString(),
        path: makePostPath(id)
      };
      const index = await loadLocalFeed();
      const publishedResult = await publishPostWithIndex(sessionToken, post, index);
      setFeedIndex(publishedResult.feedIndex);
      feedRefreshGeneration.current += 1;
      setFeed((current) =>
        addOptimisticLocalPost(
          current,
          post,
          publishedResult.post.address || `${localIdentity}${post.path}`
        )
      );
      setPostDraft({ title: "", body: "" });
      setNotice("Post published and local feed index updated.");
      void refreshFeedSilently();
    });
  }

  async function addContact() {
    const identity = contactDraft.identity.trim();
    if (!identity) {
      setError("Contact identity is required.");
      return;
    }
    const nextContact: Contact = {
      identity,
      displayName: contactDraft.displayName.trim() || identity,
      relationship: "local"
    };
    const nextContacts = upsertContact(contacts, nextContact);
    setContacts(nextContacts);
    setFeed((current) =>
      current.map((item) =>
        item.source === "contact" && item.contact?.identity === identity
          ? { ...item, contact: nextContact }
          : item
      )
    );
    setContactDraft({
      identity: "",
      displayName: ""
    });
    void loadFeedSnapshot(nextContacts);
  }

  async function sendFollowRequest() {
    const identity = contactDraft.identity.trim();
    if (!identity) {
      setError("Contact identity is required.");
      return;
    }

    await withBusy("follow", async () => {
      const request: SpokeFollowRequest = {
        schema: "spoke.follow_request.v1",
        id: makeId("follow_req"),
        sender: localIdentity,
        recipient: identity,
        displayName: profileDraft.displayName.trim() || localIdentity,
        message: followMessageDraft.trim(),
        createdAt: new Date().toISOString()
      };
      await submitFollowRequestByIdentity(sessionToken, identity, request);
      const nextContacts = upsertContact(
        contacts,
        requestContactFromDraft(identity, contactDraft.displayName)
      );
      setContacts(nextContacts);
      setContactDraft({
        identity: "",
        displayName: ""
      });
      setFollowMessageDraft("");
      setNotice("Follow request sent through encrypted ingress.");
    });
  }

  async function fetchIndex(identity: string) {
    const result = await fetchTarget(sessionToken, `${identity}/spoke/feed`);
    return JSON.parse(decodeFetchData(result)) as SpokeFeedIndex;
  }

  async function fetchPost(addressOrPath: string, owner: string) {
    const target = addressOrPath.startsWith("/spoke/")
      ? `${owner}${addressOrPath}`
      : addressOrPath;
    const result = await fetchTarget(sessionToken, target);
    return JSON.parse(decodeFetchData(result)) as SpokePost;
  }

  async function fetchReply(contentId: string) {
    const result = await fetchTarget(sessionToken, contentId);
    return JSON.parse(decodeFetchData(result)) as SpokeReply;
  }

  async function decryptReply(address: string) {
    const result = await decryptEncryptedTarget(sessionToken, address);
    return parseJsonBytes<SpokeReply>(result.plaintext);
  }

  async function loadFeedSnapshot(nextContacts = contacts) {
    const feedContacts = activeContacts(nextContacts);
    const generation = ++feedRefreshGeneration.current;
    setFeedRefreshing(true);
    const nextPublished = await listPublished(sessionToken).catch(() => []);
    const localIndex = await loadLocalFeed(nextPublished);

    const localItems: Array<FeedItem | null> = await Promise.all(
      localPostReferences(localIndex, nextPublished).map(async (item) => {
        try {
          const post = item.contentId
            ? await fetchPublishedJson<SpokePost>(item.contentId)
            : await fetchPost(item.address || item.path, localIdentity);
          return {
            source: "local" as const,
            post,
            address: item.address || `${localIdentity}${item.path}`
          };
        } catch {
          // A stale feed entry should not block the rest of the timeline.
          return null;
        }
      })
    );
    const nextLocalItems = localItems.filter(isFeedItem);

    if (generation === feedRefreshGeneration.current) {
      setFeed((current) => mergeLocalFeedSnapshot(current, nextLocalItems));
      setFeedRefreshing(false);
    }

    const contactItemGroups: Array<Array<FeedItem | null>> = await Promise.all(
      feedContacts.map(async (contact) => {
        try {
          const index = await fetchIndex(contact.identity);
          return Promise.all(
            index.posts.map(async (item) => {
              try {
                const post = item.contentId
                  ? await fetchPublishedJson<SpokePost>(item.contentId)
                  : await fetchPost(item.address || item.path, contact.identity);
                return {
                  source: "contact" as const,
                  contact,
                  post,
                  address: item.address || `${contact.identity}${item.path}`
                };
              } catch {
                // Keep loading the rest of this contact's posts.
                return null;
              }
            })
          );
        } catch {
          // Contacts can be offline or unknown.
          return [];
        }
      })
    );

    const nextItems: FeedItem[] = [
      ...nextLocalItems,
      ...contactItemGroups.flat().filter(isFeedItem)
    ];
    const spokeObjects = nextPublished.filter((item) => item.path?.startsWith("/spoke/"));

    if (generation === feedRefreshGeneration.current) {
      setFeed((current) => mergeFeedSnapshot(current, nextItems));
      setFeedRefreshing(false);
    }

    const nextReplies: RepliesByPost = {};
    const acceptedReplies = await Promise.all(
      spokeObjects
        .filter((object) => object.path?.startsWith("/spoke/replies/"))
        .map(async (item) => {
          try {
            return await fetchReply(item.content_id);
          } catch {
            // Stale or non-reply objects should not block the conversation view.
            return null;
          }
        })
    );
    const outgoingReplies = await Promise.all(
      spokeObjects
        .filter((object) => object.path?.startsWith("/spoke/outgoing/"))
        .map(async (item) => {
          try {
            return await decryptReply(item.address || `${localIdentity}${item.path}`);
          } catch {
            // Outgoing encrypted objects may be old or not decryptable with this identity.
            return null;
          }
        })
    );
    for (const reply of [...acceptedReplies, ...outgoingReplies]) {
      if (reply) {
        Object.assign(nextReplies, addReplyToPost(nextReplies, reply));
      }
    }

    if (generation === feedRefreshGeneration.current) {
      setRepliesByPost(nextReplies);
    }
  }

  async function refreshFeed() {
    await withBusy("feed", async () => {
      await loadFeedSnapshot();
      setNotice("Feed refreshed.");
    });
  }

  async function refreshFeedSilently() {
    if (feedRefreshInFlight.current) {
      return;
    }
    feedRefreshInFlight.current = true;
    try {
      await loadFeedSnapshot();
    } catch {
      // Silent polling should not interrupt the active workflow.
    } finally {
      feedRefreshInFlight.current = false;
      setFeedRefreshing(false);
    }
  }

  async function sendReply(item: FeedItem) {
    const body = (replyDrafts[item.address] || "").trim();
    if (!body) {
      setError("Reply body is required.");
      return;
    }
    await withBusy(`reply:${item.address}`, async () => {
      const reply: SpokeReply = {
        schema: "spoke.reply.v1",
        id: makeId("reply"),
        sender: localIdentity,
        postAuthor: item.post.author,
        postAddress: item.address,
        body,
        createdAt: new Date().toISOString()
      };
      await submitReplyByIdentity(sessionToken, item.contact!.identity, reply);
      setRepliesByPost((current) => addReplyToPost(current, reply));
      setReplyDrafts((current) => ({ ...current, [item.address]: "" }));
      setNotice("Encrypted reply submitted to recipient ingress.");
    });
  }

  async function acceptPendingIngress(ingressId: string) {
    try {
      await acceptIngress(sessionToken, ingressId);
    } catch (err) {
      if (!isAlreadyHandledIngressError(err)) {
        throw err;
      }
    }
  }

  async function loadIncomingSnapshot() {
    const records = await listPendingIngress(sessionToken);
    let nextContacts = contactsRef.current;
    let contactsChanged = false;
    const autoHandledIngressIds: string[] = [];
    const visibleRecords: IngressRecord[] = [];

    for (const record of records) {
      if (
        record.schema_hint &&
        record.schema_hint !== "spoke.follow_response.v1" &&
        record.schema_hint !== "spoke.reply.v1"
      ) {
        visibleRecords.push(record);
        continue;
      }

      try {
        const opened = await openIngress(sessionToken, record.ingress_id);
        const payload = parseIncomingPayload(opened.plaintext);
        if (isSpokeFollowResponse(payload) && hasRequestedContactForResponse(nextContacts, payload)) {
          await acceptPendingIngress(record.ingress_id);
          nextContacts = applyFollowResponse(nextContacts, payload);
          contactsChanged = true;
          autoHandledIngressIds.push(record.ingress_id);
          continue;
        }
        if (isSpokeReply(payload) && hasAcceptedContactForIdentity(nextContacts, payload.sender)) {
          await acceptPendingIngress(record.ingress_id);
          setRepliesByPost((current) => addReplyToPost(current, payload));
          await publishAcceptedReply(payload, { silent: true });
          autoHandledIngressIds.push(record.ingress_id);
          continue;
        }
      } catch {
        // Keep anything we cannot auto-classify in the manual review queue.
      }

      visibleRecords.push(record);
    }

    setIncoming(visibleRecords);
    if (autoHandledIngressIds.length > 0) {
      setReview((current) => {
        const next = { ...current };
        for (const ingressId of autoHandledIngressIds) {
          delete next[ingressId];
        }
        return next;
      });
    }
    if (contactsChanged) {
      contactsRef.current = nextContacts;
      setContacts(nextContacts);
      void loadFeedSnapshot(nextContacts);
    }
  }

  async function refreshIncoming() {
    await withBusy("incoming", async () => {
      await loadIncomingSnapshot();
      setNotice("Incoming requests refreshed.");
    });
  }

  async function refreshIncomingSilently() {
    if (incomingRefreshInFlight.current) {
      return;
    }
    incomingRefreshInFlight.current = true;
    try {
      await loadIncomingSnapshot();
    } catch {
      // Silent polling should not interrupt the active workflow.
    } finally {
      incomingRefreshInFlight.current = false;
    }
  }

  async function openIncoming(record: IngressRecord) {
    setReview((current) => ({
      ...current,
      [record.ingress_id]: { loading: true }
    }));
    try {
      const opened = await openIngress(sessionToken, record.ingress_id);
      const payload = parseIncomingPayload(opened.plaintext);
      setReview((current) => ({
        ...current,
        [record.ingress_id]: { loading: false, opened: payload }
      }));
    } catch (err) {
      setReview((current) => ({
        ...current,
        [record.ingress_id]: { loading: false, error: apiErrorMessage(err) }
      }));
    }
  }

  async function acceptIncoming(record: IngressRecord) {
    await withBusy(`accept:${record.ingress_id}`, async () => {
      const opened =
        review[record.ingress_id]?.opened ||
        parseIncomingPayload((await openIngress(sessionToken, record.ingress_id)).plaintext);
      await acceptPendingIngress(record.ingress_id);
      setIncoming((current) => current.filter((item) => item.ingress_id !== record.ingress_id));
      if (isSpokeFollowRequest(opened)) {
        const nextContacts = upsertContact(contacts, acceptedContactFromRequest(opened));
        setContacts(nextContacts);
        await sendFollowResponse(opened, "accepted");
        setNotice("Follow request accepted.");
        void loadFeedSnapshot(nextContacts);
        return;
      }
      if (isSpokeFollowResponse(opened)) {
        const nextContacts = applyFollowResponse(contacts, opened);
        setContacts(nextContacts);
        setNotice(
          opened.decision === "accepted"
            ? "Follow request accepted by recipient."
            : "Follow request rejected by recipient."
        );
        void loadFeedSnapshot(nextContacts);
        return;
      }
      setRepliesByPost((current) => addReplyToPost(current, opened));
      setNotice("Reply accepted. Publishing local copy...");
      void publishAcceptedReply(opened);
    });
  }

  async function sendFollowResponse(
    request: SpokeFollowRequest,
    decision: SpokeFollowResponse["decision"]
  ) {
    const response: SpokeFollowResponse = {
      schema: "spoke.follow_response.v1",
      id: makeId("follow_resp"),
      requestId: request.id,
      sender: localIdentity,
      recipient: request.sender,
      decision,
      createdAt: new Date().toISOString()
    };
    await submitFollowResponseByIdentity(sessionToken, request.sender, response);
  }

  async function publishAcceptedReply(reply: SpokeReply, options: { silent?: boolean } = {}) {
    try {
      await publishJson(sessionToken, makeReplyPath(reply.id), reply);
      if (!options.silent) {
        setNotice("Reply accepted and published locally.");
      }
      void refreshFeedSilently();
    } catch (err) {
      setError(`Reply accepted, but local publish failed: ${apiErrorMessage(err)}`);
    }
  }

  async function rejectIncoming(record: IngressRecord) {
    await withBusy(`reject:${record.ingress_id}`, async () => {
      let opened = review[record.ingress_id]?.opened;
      if (!opened) {
        try {
          opened = parseIncomingPayload((await openIngress(sessionToken, record.ingress_id)).plaintext);
        } catch {
          opened = undefined;
        }
      }
      await rejectIngress(sessionToken, record.ingress_id);
      if (opened && isSpokeFollowRequest(opened)) {
        await sendFollowResponse(opened, "rejected");
      }
      setIncoming((current) => current.filter((item) => item.ingress_id !== record.ingress_id));
      setNotice("Incoming object rejected.");
    });
  }

  useEffect(() => {
    if (!canUseApp) {
      return;
    }

    refreshFeedSilently();
    const timer = window.setInterval(refreshFeedSilently, FEED_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [canUseApp, sessionToken, localIdentity, contacts]);

  useEffect(() => {
    if (!canUseApp) {
      return;
    }

    refreshIncomingSilently();
    const timer = window.setInterval(refreshIncomingSilently, INCOMING_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [canUseApp, sessionToken]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Jolt social PoC</p>
          <h1>Spoke</h1>
        </div>
        <div className="status-strip">
          <span>{displayIdentity(localIdentity)}</span>
          <span>{session.status}</span>
          {updateCheck?.available ? (
            <button
              type="button"
              onClick={installSpokeUpdate}
              disabled={updateAction === "install"}
              title="Install signed Spoke update"
            >
              <Download size={16} />
              Update available
            </button>
          ) : null}
          <button
            type="button"
            onClick={checkSpokeUpdate}
            disabled={updateAction === "check" || updateAction === "install"}
            title="Check for Spoke updates"
          >
            <RefreshCw size={16} />
          </button>
          <button type="button" onClick={refreshSession} disabled={!sessionToken || busy === "session"} title="Refresh session">
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {notice ? <div className="alert notice">{notice}</div> : null}

      {!canUseApp ? (
        <section className="session-panel">
          <div>
            <KeyRound size={32} />
            <h2>Connect Spoke to Jolt</h2>
            <p>
              Spoke needs scoped access to publish `/spoke/*`, read public Jolt content,
              and review incoming social objects.
            </p>
          </div>
          <button className="primary" type="button" onClick={requestSession} disabled={busy === "session"}>
            <KeyRound size={16} />
            Request access
          </button>
        </section>
      ) : (
        <div className="workspace">
          <aside className="rail">
            <section className="panel">
              <div className="panel-heading">
                <h2>Profile</h2>
                <button type="button" onClick={publishProfileFromDraft} disabled={busy === "profile"} title="Publish profile">
                  <Send size={16} />
                </button>
              </div>
              <label>
                Display name
                <input
                  value={profileDraft.displayName}
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...current, displayName: event.target.value }))
                  }
                  placeholder="Alex"
                />
              </label>
              <label>
                Bio
                <textarea
                  rows={3}
                  value={profileDraft.bio}
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...current, bio: event.target.value }))
                  }
                  placeholder="Short note for known contacts"
                />
              </label>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <h2>Contacts</h2>
                <button type="button" onClick={addContact} title="Add contact">
                  <UserCheck size={16} />
                </button>
              </div>
              <label>
                Identity
                <input
                  value={contactDraft.identity}
                  onChange={(event) =>
                    setContactDraft((current) => ({ ...current, identity: event.target.value }))
                  }
                  placeholder="bob.jolt"
                />
              </label>
              <label>
                Name
                <input
                  value={contactDraft.displayName}
                  onChange={(event) =>
                    setContactDraft((current) => ({ ...current, displayName: event.target.value }))
                  }
                  placeholder="Bob"
                />
              </label>
              <label>
                Request note
                <textarea
                  rows={2}
                  value={followMessageDraft}
                  onChange={(event) => setFollowMessageDraft(event.target.value)}
                  placeholder="Optional intro"
                />
              </label>
              <button
                type="button"
                onClick={sendFollowRequest}
                disabled={busy === "follow"}
                title="Send follow request"
              >
                <UserPlus size={16} />
                Request follow
              </button>
              <div className="contact-list">
                {contacts.map((contact) => (
                  <div className="contact-row" key={contact.identity}>
                    <div>
                      <strong>{contact.displayName}</strong>
                      <span>{contact.identity}</span>
                      <span className="contact-status">{contact.relationship || "accepted"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        {
                          setContacts((current) =>
                            current.filter((item) => item.identity !== contact.identity)
                          );
                          setFeed((current) => removeContactFeedItems(current, contact.identity));
                        }
                      }
                      title="Remove contact"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="main-column">
            <section className="composer">
              <div className="composer-fields">
                <input
                  value={postDraft.title}
                  onChange={(event) =>
                    setPostDraft((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Post title"
                />
                <textarea
                  value={postDraft.body}
                  onChange={(event) =>
                    setPostDraft((current) => ({ ...current, body: event.target.value }))
                  }
                  rows={4}
                  placeholder="Write a note for known contacts"
                />
              </div>
              <button className="primary" type="button" onClick={publishPost} disabled={busy === "post"}>
                <Plus size={16} />
                Publish
              </button>
            </section>

            <section className="feed-toolbar">
              <div>
                <h2>Known Feed</h2>
                <p>
                  {localPosts} local posts, {activeContactCount} active contacts
                  {feedRefreshing ? " - updating..." : ""}
                </p>
              </div>
              <button type="button" onClick={refreshFeed} disabled={busy === "feed" || feedRefreshing} title="Refresh feed">
                <RefreshCw size={16} />
              </button>
            </section>

            <div className="feed-list">
              {feed.map((item) => (
                <article className="post-card" key={`${item.source}:${item.address}`}>
                  <header>
                    <div>
                      <strong>{displayNameForFeedItem(item)}</strong>
                      <span>{item.post.author}</span>
                    </div>
                    <time>{new Date(item.post.createdAt).toLocaleString()}</time>
                  </header>
                  <h3>{item.post.title}</h3>
                  <p>{item.post.body}</p>
                  <div className="thread">
                    {(repliesByPost[item.address] || []).map((reply) => (
                      <div className="reply" key={reply.id}>
                        <header>
                          <strong>{displayNameForIdentity(reply.sender)}</strong>
                          <time>{new Date(reply.createdAt).toLocaleString()}</time>
                        </header>
                        <p>{reply.body}</p>
                      </div>
                    ))}
                    {(repliesByPost[item.address] || []).length === 0 ? (
                      <span className="thread-empty">No replies yet.</span>
                    ) : null}
                  </div>
                  {item.source === "contact" ? (
                    <div className="reply-box">
                      <textarea
                        rows={2}
                        value={replyDrafts[item.address] || ""}
                        onChange={(event) =>
                          setReplyDrafts((current) => ({
                            ...current,
                            [item.address]: event.target.value
                          }))
                        }
                        placeholder={`Reply to ${displayNameForFeedItem(item)}`}
                      />
                      <button type="button" onClick={() => sendReply(item)} title="Send encrypted reply">
                        <MessageCircle size={16} />
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
              {feed.length === 0 ? (
                <div className="empty-state">Publish a post or add a known identity to build the feed.</div>
              ) : null}
            </div>
          </section>

          <aside className="rail">
            <section className="panel">
              <div className="panel-heading">
                <h2>Incoming</h2>
                <button type="button" onClick={refreshIncoming} disabled={busy === "incoming"} title="Refresh incoming">
                  <Inbox size={16} />
                </button>
              </div>
              <div className="incoming-list">
                {incoming.map((record) => {
                  const opened = review[record.ingress_id]?.opened;
                  return (
                    <article className="incoming-card" key={record.ingress_id}>
                      <header>
                        <div>
                          <strong>{record.sender_identity}</strong>
                          <span>{opened ? incomingKind(opened) : record.schema_hint || "encrypted object"}</span>
                        </div>
                        <div className="decision-buttons">
                          <button
                            type="button"
                            onClick={() => acceptIncoming(record)}
                            disabled={busy === `accept:${record.ingress_id}`}
                            title="Accept"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectIncoming(record)}
                            disabled={busy === `reject:${record.ingress_id}`}
                            title="Reject"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </header>
                      {opened ? (
                        <div className="opened-reply">
                          <span>{incomingKind(opened)}</span>
                          <p>{incomingPreview(opened)}</p>
                        </div>
                      ) : (
                        <button type="button" onClick={() => openIncoming(record)} title="Open">
                          Open
                        </button>
                      )}
                      {review[record.ingress_id]?.error ? (
                        <p className="inline-error">{review[record.ingress_id]?.error}</p>
                      ) : null}
                    </article>
                  );
                })}
                {incoming.length === 0 ? <div className="empty-state compact">No pending ingress.</div> : null}
              </div>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}

export default App;
