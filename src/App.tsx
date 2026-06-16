import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  ArrowLeft,
  Check,
  Download,
  ImagePlus,
  Inbox,
  KeyRound,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  Trash2,
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
  makeThreadPath,
  openIngress,
  parseJsonBytes,
  publishBinary,
  publishJson,
  publishPostWithIndex,
  publishProfile,
  rejectIngress,
  requestSpokeSession,
  submitFollowRequestByIdentity,
  submitFollowResponseByIdentity,
  submitMessageByIdentity,
  submitReplyByIdentity,
  type AppSessionStatus,
  type IngressRecord,
  type NodeStatus,
  type PublishedContent,
  type SpokeFeedIndex,
  type SpokePost,
  type SpokeProfile,
  type SpokeReply,
  type SpokeThreadIndex
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
import {
  addReplyToPost,
  threadPathForPostAddress,
  upsertReplyInThreadIndex,
  type RepliesByPost
} from "./thread";
import {
  conversationIdForParticipants,
  conversationsFromMessages,
  isSpokeMessage,
  messageBelongsToConversation,
  otherParticipants,
  upsertConversationMessage,
  type Conversation,
  type ConversationsById,
  type SpokeMessage
} from "./message";
import {
  attachmentFetchTarget,
  createImageAttachmentReference,
  isSupportedImageMimeType,
  mediaPath,
  validateImageAttachment,
  type ImageAttachmentMimeType,
  type SpokeAttachment
} from "./media";
import {
  tauriSpokeUpdateClient,
  type SpokeUpdateCheck,
  type SpokeUpdateClient
} from "./update/client";

type AppView = "feed" | "messages";

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

type SpokeIncomingPayload = SpokeReply | SpokeFollowRequest | SpokeFollowResponse | SpokeMessage;

type MessageThread = {
  id: string;
  contact: Contact;
  conversation?: Conversation;
  lastMessageAt?: string;
};

type PendingPostAttachment = {
  id: string;
  file: File;
  previewUrl: string;
  mimeType: ImageAttachmentMimeType;
  width?: number;
  height?: number;
  alt: string;
};

const SESSION_KEY = "spoke.session";
const CONTACTS_KEY = "spoke.contacts";
const PROFILE_KEY = "spoke.profile";
const FEED_REFRESH_MS = 2000;
const INCOMING_REFRESH_MS = 2000;
const CONVERSATION_REFRESH_MS = 3000;

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

function attachmentKey(attachment: SpokeAttachment) {
  return attachment.contentId || attachment.address || attachment.id;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  if (isSpokeMessage(payload)) return "message";
  return "reply";
}

function incomingPreview(payload: SpokeIncomingPayload) {
  if (isSpokeFollowRequest(payload)) {
    return payload.message || `${payload.sender} wants to follow you.`;
  }
  if (isSpokeFollowResponse(payload)) {
    return `${payload.sender} ${payload.decision} your follow request.`;
  }
  if (isSpokeMessage(payload)) {
    return payload.body;
  }
  return payload.body;
}

function parseIncomingPayload(bytes: number[]) {
  const payload = parseJsonBytes<unknown>(bytes);
  if (
    isSpokeReply(payload) ||
    isSpokeFollowRequest(payload) ||
    isSpokeFollowResponse(payload) ||
    isSpokeMessage(payload)
  ) {
    return payload;
  }
  throw new Error("Unsupported Spoke incoming object.");
}

function messageTargetsIdentity(message: SpokeMessage, identity: string) {
  return message.recipients.some((recipient) => sameIdentity(recipient, identity));
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
  const [postAttachments, setPostAttachments] = useState<PendingPostAttachment[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [attachmentErrors, setAttachmentErrors] = useState<Record<string, string>>({});
  const [feedIndex, setFeedIndex] = useState<SpokeFeedIndex | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [repliesByPost, setRepliesByPost] = useState<RepliesByPost>({});
  const [conversations, setConversations] = useState<ConversationsById>({});
  const [activeView, setActiveView] = useState<AppView>("feed");
  const [activeThreadId, setActiveThreadId] = useState("");
  const [incoming, setIncoming] = useState<IngressRecord[]>([]);
  const [review, setReview] = useState<ReviewState>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updateCheck, setUpdateCheck] = useState<SpokeUpdateCheck | null>(null);
  const [updateAction, setUpdateAction] = useState<"check" | "install" | null>(null);
  const [sessionValidated, setSessionValidated] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const feedRefreshInFlight = useRef(false);
  const incomingRefreshInFlight = useRef(false);
  const conversationRefreshInFlight = useRef(false);
  const feedRefreshGeneration = useRef(0);
  const contactsRef = useRef<Contact[]>(contacts);
  const pendingAttachmentUrlsRef = useRef<string[]>([]);
  const fetchedAttachmentUrlsRef = useRef<Set<string>>(new Set());
  const fetchingAttachmentKeysRef = useRef<Set<string>>(new Set());
  const updateClient: SpokeUpdateClient = tauriSpokeUpdateClient;

  const sessionToken = session.token || "";
  const localIdentity = session.identity || status?.identity_address || "";
  const canUseApp = Boolean(sessionToken && session.status === "active" && sessionValidated);

  const localPosts = useMemo(
    () => feed.filter((item) => item.source === "local").length,
    [feed]
  );
  const activeContactCount = useMemo(() => activeContacts(contacts).length, [contacts]);
  const acceptedContacts = useMemo(
    () => contacts.filter((contact) => contact.relationship === "accepted"),
    [contacts]
  );
  const conversationList = useMemo(
    () => Object.values(conversations).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
    [conversations]
  );
  const displayNameForIdentity = (identity: string) => {
    if (sameIdentity(identity, localIdentity)) {
      return profileDraft.displayName.trim() || localIdentity;
    }
    return contacts.find((contact) => sameIdentity(contact.identity, identity))?.displayName || identity;
  };
  const messageThreads = useMemo<MessageThread[]>(() => {
    if (!localIdentity) {
      return [];
    }

    const threads = new Map<string, MessageThread>();
    for (const contact of acceptedContacts) {
      const id = conversationIdForParticipants([localIdentity, contact.identity]);
      threads.set(id, {
        id,
        contact,
        conversation: conversations[id],
        lastMessageAt: conversations[id]?.lastMessageAt
      });
    }
    for (const conversation of conversationList) {
      if (threads.has(conversation.id)) {
        continue;
      }
      const participant = otherParticipants(conversation, localIdentity)[0];
      if (!participant) {
        continue;
      }
      threads.set(conversation.id, {
        id: conversation.id,
        contact: {
          identity: participant,
          displayName: displayNameForIdentity(participant),
          relationship: "accepted"
        },
        conversation,
        lastMessageAt: conversation.lastMessageAt
      });
    }

    return [...threads.values()].sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) {
        return b.lastMessageAt.localeCompare(a.lastMessageAt);
      }
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return a.contact.displayName.localeCompare(b.contact.displayName);
    });
  }, [acceptedContacts, conversationList, conversations, localIdentity, contacts, profileDraft.displayName]);
  const activeThread = useMemo(() => {
    return messageThreads.find((thread) => thread.id === activeThreadId) || messageThreads[0] || null;
  }, [messageThreads, activeThreadId]);
  const activeThreadMessages = activeThread?.conversation?.messages || [];
  const feedAttachments = useMemo(
    () => feed.flatMap((item) => item.post.attachments || []),
    [feed]
  );

  useEffect(() => {
    getStatus()
      .then(setStatus)
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  useEffect(() => {
    return () => {
      for (const url of pendingAttachmentUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      for (const url of fetchedAttachmentUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  useEffect(() => {
    contactsRef.current = contacts;
    saveJson(CONTACTS_KEY, contacts);
  }, [contacts]);

  useEffect(() => {
    if (activeView !== "messages") {
      return;
    }
    if (!messageThreads.length) {
      setActiveThreadId("");
      return;
    }
    if (!activeThreadId || !messageThreads.some((thread) => thread.id === activeThreadId)) {
      setActiveThreadId(messageThreads[0].id);
    }
  }, [activeView, activeThreadId, messageThreads]);

  useEffect(() => {
    saveJson(PROFILE_KEY, profileDraft);
  }, [profileDraft]);

  useEffect(() => {
    saveJson(SESSION_KEY, session);
  }, [session]);

  useEffect(() => {
    if (!canUseApp || !sessionToken || feedAttachments.length === 0) {
      return;
    }

    let cancelled = false;
    for (const attachment of feedAttachments) {
      const key = attachmentKey(attachment);
      const target = attachmentFetchTarget(attachment);
      if (
        !target ||
        attachmentUrls[key] ||
        attachmentErrors[key] ||
        fetchingAttachmentKeysRef.current.has(key)
      ) {
        continue;
      }

      fetchingAttachmentKeysRef.current.add(key);
      fetchTarget(sessionToken, target)
        .then((result) => {
          if (cancelled) {
            return;
          }
          const blob = new Blob([new Uint8Array(result.data)], { type: attachment.mimeType });
          const url = URL.createObjectURL(blob);
          fetchedAttachmentUrlsRef.current.add(url);
          setAttachmentUrls((current) => ({ ...current, [key]: url }));
        })
        .catch((err) => {
          if (!cancelled) {
            setAttachmentErrors((current) => ({ ...current, [key]: apiErrorMessage(err) }));
          }
        })
        .finally(() => {
          fetchingAttachmentKeysRef.current.delete(key);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [attachmentErrors, attachmentUrls, canUseApp, feedAttachments, sessionToken]);

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

  function readImageDimensions(url: string) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("Image attachment could not be read."));
      image.src = url;
    });
  }

  async function addPostAttachments(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (files.length === 0) {
      return;
    }

    setError("");
    setNotice("");
    const nextAttachments: PendingPostAttachment[] = [];
    try {
      for (const file of files) {
        validateImageAttachment(file);
        if (!isSupportedImageMimeType(file.type)) {
          throw new Error("Images must be JPEG, PNG, or WebP.");
        }
        const previewUrl = URL.createObjectURL(file);
        try {
          const dimensions = await readImageDimensions(previewUrl);
          pendingAttachmentUrlsRef.current.push(previewUrl);
          nextAttachments.push({
            id: makeId("media"),
            file,
            previewUrl,
            mimeType: file.type,
            width: dimensions.width,
            height: dimensions.height,
            alt: ""
          });
        } catch (err) {
          URL.revokeObjectURL(previewUrl);
          throw err;
        }
      }
    } catch (err) {
      for (const attachment of nextAttachments) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      setError(apiErrorMessage(err));
      return;
    }

    setPostAttachments((current) => [...current, ...nextAttachments]);
  }

  function removePostAttachment(id: string) {
    setPostAttachments((current) => {
      const attachment = current.find((item) => item.id === id);
      if (attachment) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function updatePostAttachmentAlt(id: string, alt: string) {
    setPostAttachments((current) =>
      current.map((attachment) => attachment.id === id ? { ...attachment, alt } : attachment)
    );
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
      const attachments = await Promise.all(
        postAttachments.map(async (attachment) => {
          const published = await publishBinary(sessionToken, mediaPath(attachment.id), attachment.file, {
            fileName: attachment.file.name || `${attachment.id}.image`,
            mimeType: attachment.mimeType
          });
          return createImageAttachmentReference({
            id: attachment.id,
            published,
            mimeType: attachment.mimeType,
            width: attachment.width,
            height: attachment.height,
            alt: attachment.alt.trim() || undefined
          });
        })
      );
      const post: SpokePost = {
        schema: attachments.length > 0 ? "spoke.post.v2" : "spoke.post.v1",
        id,
        author: localIdentity,
        displayName: profileDraft.displayName.trim() || localIdentity,
        title,
        body,
        createdAt: new Date().toISOString(),
        path: makePostPath(id),
        threadPath: makeThreadPath(id),
        ...(attachments.length > 0 ? { attachments } : {})
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
      for (const attachment of postAttachments) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      setPostAttachments([]);
      setNotice(
        attachments.length > 0
          ? "Post and media attachments published."
          : "Post published and local feed index updated."
      );
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

  async function fetchMessage(contentId: string) {
    const result = await fetchTarget(sessionToken, contentId);
    const message = JSON.parse(decodeFetchData(result)) as unknown;
    if (!isSpokeMessage(message)) {
      throw new Error("Fetched object is not a Spoke message.");
    }
    return message;
  }

  async function fetchThreadIndex(addressOrPath: string, owner: string) {
    const target = addressOrPath.startsWith("/spoke/")
      ? `${owner}${addressOrPath}`
      : addressOrPath;
    const result = await fetchTarget(sessionToken, target);
    return JSON.parse(decodeFetchData(result)) as SpokeThreadIndex;
  }

  async function decryptReply(address: string) {
    const result = await decryptEncryptedTarget(sessionToken, address);
    return parseJsonBytes<SpokeReply>(result.plaintext);
  }

  async function decryptMessage(address: string) {
    const result = await decryptEncryptedTarget(sessionToken, address);
    const message = parseJsonBytes<unknown>(result.plaintext);
    if (!isSpokeMessage(message)) {
      throw new Error("Encrypted object is not a Spoke message.");
    }
    return message;
  }

  async function loadLocalThreadIndex(postAddress: string) {
    const threadPath = threadPathForPostAddress(postAddress);
    const inventory = await listPublished(sessionToken).catch(() => []);
    const publishedThread = latestPublishedByPath(inventory, threadPath);
    return publishedThread
      ? await fetchPublishedJson<SpokeThreadIndex>(publishedThread.content_id)
      : null;
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
    const sharedThreadReplies = await Promise.all(
      nextItems
        .filter((item) => item.source === "contact")
        .map(async (item) => {
          try {
            const owner = item.contact?.identity || item.post.author;
            const threadPath = item.post.threadPath || threadPathForPostAddress(item.address);
            const thread = await fetchThreadIndex(threadPath, owner);
            return await Promise.all(
              thread.replies
                .filter((reply) => reply.moderation === "accepted")
                .map(async (reply) => {
                  try {
                    const target = reply.contentId || reply.address;
                    return target ? await fetchReply(target) : null;
                  } catch {
                    // Stale thread entries should not hide the rest of the thread.
                    return null;
                  }
                })
            );
          } catch {
            // Thread indexes are additive; older posts may not have one yet.
            return [];
          }
        })
    );
    for (const reply of [
      ...acceptedReplies,
      ...outgoingReplies,
      ...sharedThreadReplies.flat()
    ]) {
      if (reply) {
        Object.assign(nextReplies, addReplyToPost(nextReplies, reply));
      }
    }

    if (generation === feedRefreshGeneration.current) {
      setRepliesByPost(nextReplies);
    }
  }

  async function loadConversationSnapshot() {
    const nextPublished = await listPublished(sessionToken).catch(() => []);
    const spokeObjects = nextPublished.filter((item) => item.path?.startsWith("/spoke/"));
    const receivedMessages = await Promise.all(
      spokeObjects
        .filter((object) => object.path?.startsWith("/spoke/messages/received/"))
        .map(async (item) => {
          try {
            const message = await fetchMessage(item.content_id);
            return { message, direction: "received" as const };
          } catch {
            return null;
          }
        })
    );
    const sentMessages = await Promise.all(
      spokeObjects
        .filter((object) => object.path?.startsWith("/spoke/messages/outgoing/"))
        .map(async (item) => {
          try {
            const message = await decryptMessage(item.address || `${localIdentity}${item.path}`);
            return { message, direction: "sent" as const };
          } catch {
            return null;
          }
        })
    );
    setConversations(
      conversationsFromMessages([...receivedMessages, ...sentMessages].filter((item) => item !== null))
    );
  }

  async function refreshConversationsSilently() {
    if (conversationRefreshInFlight.current) {
      return;
    }
    conversationRefreshInFlight.current = true;
    try {
      await loadConversationSnapshot();
    } catch {
      // Conversation polling should not interrupt posting or messaging.
    } finally {
      conversationRefreshInFlight.current = false;
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

  async function sendMessage(contact: Contact) {
    const body = (messageDrafts[contact.identity] || "").trim();
    if (!body) {
      setError("Message body is required.");
      return;
    }

    await withBusy(`message:${contact.identity}`, async () => {
      const message: SpokeMessage = {
        schema: "spoke.message.v1",
        id: makeId("msg"),
        conversationId: conversationIdForParticipants([localIdentity, contact.identity]),
        sender: localIdentity,
        recipients: [contact.identity],
        body,
        createdAt: new Date().toISOString()
      };
      if (!messageBelongsToConversation(message)) {
        throw new Error("Message participants do not match its conversation.");
      }
      await submitMessageByIdentity(sessionToken, contact.identity, message);
      setConversations((current) => upsertConversationMessage(current, message, "sent"));
      setMessageDrafts((current) => ({ ...current, [contact.identity]: "" }));
      setNotice("Encrypted message submitted to recipient ingress.");
    });
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, contact: Contact) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void sendMessage(contact);
  }

  async function publishReceivedMessage(
    message: SpokeMessage,
    options: { silent?: boolean } = {}
  ) {
    try {
      await publishJson(sessionToken, `/spoke/messages/received/${message.id}`, message);
      if (!options.silent) {
        setNotice("Message accepted into the local conversation.");
      }
      void refreshConversationsSilently();
    } catch (err) {
      setError(`Message accepted, but local publish failed: ${apiErrorMessage(err)}`);
    }
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
        record.schema_hint !== "spoke.reply.v1" &&
        record.schema_hint !== "spoke.message.v1"
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
        if (
          isSpokeMessage(payload) &&
          hasAcceptedContactForIdentity(nextContacts, payload.sender) &&
          messageBelongsToConversation(payload) &&
          messageTargetsIdentity(payload, localIdentity)
        ) {
          await acceptPendingIngress(record.ingress_id);
          setConversations((current) => upsertConversationMessage(current, payload, "received"));
          await publishReceivedMessage(payload, { silent: true });
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
      if (isSpokeMessage(opened)) {
        if (!messageBelongsToConversation(opened) || !messageTargetsIdentity(opened, localIdentity)) {
          throw new Error("Message is not addressed to this Spoke identity.");
        }
        setConversations((current) => upsertConversationMessage(current, opened, "received"));
        setNotice("Message accepted. Publishing local copy...");
        void publishReceivedMessage(opened);
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
      const publishedReply = await publishJson(sessionToken, makeReplyPath(reply.id), reply);
      if (sameIdentity(reply.postAuthor, localIdentity)) {
        const existingThread = await loadLocalThreadIndex(reply.postAddress);
        const threadIndex = upsertReplyInThreadIndex(existingThread, reply, publishedReply);
        await publishJson(sessionToken, threadPathForPostAddress(reply.postAddress), threadIndex);
      }
      if (!options.silent) {
        setNotice("Reply accepted and published to the thread.");
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

  useEffect(() => {
    if (!canUseApp) {
      return;
    }

    refreshConversationsSilently();
    const timer = window.setInterval(refreshConversationsSilently, CONVERSATION_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [canUseApp, sessionToken, localIdentity]);

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
        <>
        <nav className="app-nav" aria-label="Spoke sections">
          <button
            type="button"
            className={activeView === "feed" ? "active" : ""}
            onClick={() => setActiveView("feed")}
          >
            Known Feed
          </button>
          <button
            type="button"
            className={activeView === "messages" ? "active" : ""}
            onClick={() => setActiveView("messages")}
          >
            <MessageCircle size={16} />
            Messages
            {conversationList.length > 0 ? <span>{conversationList.length}</span> : null}
          </button>
        </nav>

        {activeView === "feed" ? (
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
                <div className="attachment-toolbar">
                  <label className="file-button">
                    <ImagePlus size={16} />
                    Add images
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={addPostAttachments}
                    />
                  </label>
                  <span>JPEG, PNG, or WebP up to 5 MB each</span>
                </div>
                {postAttachments.length > 0 ? (
                  <div className="pending-media-grid">
                    {postAttachments.map((attachment) => (
                      <div className="pending-media-card" key={attachment.id}>
                        <img src={attachment.previewUrl} alt={attachment.file.name} />
                        <div>
                          <strong>{attachment.file.name || "Image attachment"}</strong>
                          <span>
                            {formatBytes(attachment.file.size)}
                            {attachment.width && attachment.height
                              ? ` - ${attachment.width}x${attachment.height}`
                              : ""}
                          </span>
                          <input
                            value={attachment.alt}
                            onChange={(event) => updatePostAttachmentAlt(attachment.id, event.target.value)}
                            placeholder="Alt text"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removePostAttachment(attachment.id)}
                          title="Remove image"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
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
                  {item.post.attachments?.length ? (
                    <div className="post-media-grid">
                      {item.post.attachments.map((attachment) => {
                        const key = attachmentKey(attachment);
                        return (
                          <figure className="post-media" key={key}>
                            {attachmentUrls[key] ? (
                              <img
                                src={attachmentUrls[key]}
                                alt={attachment.alt || `${item.post.title} image`}
                              />
                            ) : attachmentErrors[key] ? (
                              <div className="media-placeholder">Image unavailable</div>
                            ) : (
                              <div className="media-placeholder">Loading image...</div>
                            )}
                            {attachment.alt ? <figcaption>{attachment.alt}</figcaption> : null}
                          </figure>
                        );
                      })}
                    </div>
                  ) : null}
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
        ) : (
          <section className="messages-view">
            <aside className="messages-sidebar" aria-label="Conversations">
              <div className="messages-sidebar-header">
                <div>
                  <h2>Messages</h2>
                  <p>{messageThreads.length} conversation threads</p>
                </div>
                <button type="button" onClick={refreshIncoming} disabled={busy === "incoming"} title="Refresh incoming">
                  <RefreshCw size={16} />
                </button>
              </div>

              <div className="thread-list">
                {messageThreads.map((thread) => {
                  const lastMessage = thread.conversation?.messages[
                    thread.conversation.messages.length - 1
                  ];
                  return (
                    <button
                      type="button"
                      className={`thread-row ${activeThread?.id === thread.id ? "active" : ""}`}
                      key={thread.id}
                      onClick={() => setActiveThreadId(thread.id)}
                    >
                      <span className="thread-avatar" aria-hidden="true">
                        {thread.contact.displayName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="thread-summary">
                        <strong>{thread.contact.displayName}</strong>
                        <span>
                          {lastMessage
                            ? lastMessage.message.body
                            : `Start a private thread with ${thread.contact.displayName}`}
                        </span>
                      </span>
                      {thread.lastMessageAt ? (
                        <time>{new Date(thread.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                      ) : null}
                    </button>
                  );
                })}
                {messageThreads.length === 0 ? (
                  <div className="empty-state compact">Accept a contact before starting messages.</div>
                ) : null}
              </div>
            </aside>

            <section className="message-thread-shell">
              {activeThread ? (
                <>
                  <header className="message-thread-header">
                    <button className="mobile-back" type="button" onClick={() => setActiveView("feed")} title="Back to feed">
                      <ArrowLeft size={16} />
                    </button>
                    <span className="thread-avatar large" aria-hidden="true">
                      {activeThread.contact.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <h2>{activeThread.contact.displayName}</h2>
                      <p>{activeThread.contact.identity}</p>
                    </div>
                  </header>

                  <div className="message-thread" aria-live="polite">
                    {activeThreadMessages.map((item) => (
                      <div className={`thread-message ${item.direction}`} key={item.message.id}>
                        <div>
                          <span>{displayNameForIdentity(item.message.sender)}</span>
                          <p>{item.message.body}</p>
                          <time>{new Date(item.message.createdAt).toLocaleString()}</time>
                        </div>
                      </div>
                    ))}
                    {activeThreadMessages.length === 0 ? (
                      <div className="empty-thread">
                        <MessageCircle size={28} />
                        <h3>{activeThread.contact.displayName}</h3>
                        <p>Start the encrypted one-to-one conversation.</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="thread-composer">
                    <textarea
                      rows={2}
                      value={messageDrafts[activeThread.contact.identity] || ""}
                      onChange={(event) =>
                        setMessageDrafts((current) => ({
                          ...current,
                          [activeThread.contact.identity]: event.target.value
                        }))
                      }
                      onKeyDown={(event) => handleMessageKeyDown(event, activeThread.contact)}
                      placeholder={`Message ${activeThread.contact.displayName}`}
                    />
                    <button
                      className="primary"
                      type="button"
                      onClick={() => sendMessage(activeThread.contact)}
                      disabled={busy === `message:${activeThread.contact.identity}`}
                      title="Send encrypted message"
                    >
                      <Send size={16} />
                      Send
                    </button>
                  </div>
                </>
              ) : (
                <div className="messages-empty">
                  <MessageCircle size={36} />
                  <h2>No message threads</h2>
                  <p>Accept a contact, then start a private conversation here.</p>
                </div>
              )}
            </section>
          </section>
        )}
        </>
      )}
    </main>
  );
}

export default App;
