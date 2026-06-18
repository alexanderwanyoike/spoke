import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  AtSign,
  Bell,
  Check,
  Clock,
  Download,
  ExternalLink,
  Home,
  ImagePlus,
  Inbox,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sun,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { AttachmentDraftRow } from "@/components/spoke/attachment-draft-row";
import { EmptyState } from "@/components/spoke/empty-state";
import { MediaFrame } from "@/components/spoke/media-frame";
import { MessagesView } from "@/components/spoke/messages-view";
import { PersonRow } from "@/components/spoke/person-row";
import type { MessageThread, PendingImageAttachment } from "@/components/spoke/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger
} from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  createJoltEnumeration,
  displayNameForFeedItem,
  loadFeed,
  makePostPath,
  publishPost as publishPostCommand,
  readFeed,
  useFeed,
  activeContacts,
  type Contact,
  type FeedItem,
  type SpokePost
} from "./feed";
import {
  addContact as addContactCommand,
  isSpokeFollowRequest,
  isSpokeFollowResponse,
  loadContacts,
  publishContact,
  removeContact,
  requestFollow,
  sameIdentity,
  useContacts,
  type SpokeFollowRequest,
  type SpokeFollowResponse
} from "./follow";
import {
  acceptReply,
  createJoltThreadEnumeration,
  flattenThread,
  isReplyV2,
  loadThread,
  makeAcceptedPrefix,
  submitReply,
  useThreads,
  type SpokeReply,
  type SpokeReplyV2,
  type ThreadNode,
  type ThreadScope
} from "./thread";
import {
  conversationIdForParticipants,
  isSpokeMessage,
  loadConversations,
  messagePreview,
  otherParticipants,
  sendMessage as sendMessageCommand,
  useConversations,
  type Conversation,
  type SpokeMessage
} from "./message";
import {
  acceptInboxRecord,
  createInboxHandlers,
  processInbox,
  rejectInboxRecord
} from "./inbox";
import {
  attachmentFetchTarget,
  createEncryptedImageAttachmentReference,
  createImageAttachmentReference,
  isSupportedImageMimeType,
  mediaPath,
  messageMediaPath,
  validateImageAttachment,
  type SpokeAttachment,
  type SpokeMessageAttachment
} from "./media";
import {
  displayNameForProfileIdentity,
  loadProfile,
  normalizeProfileDraft,
  profileCacheKey,
  profileLinksFromDraft,
  publishProfile,
  useProfiles,
  type ProfileDraft,
  type SpokeProfile,
  type SpokeProfileLink
} from "./profile";
import {
  apiErrorMessage,
  createJoltSdk,
  decodeFetchData,
  decryptEncryptedTarget,
  fetchTarget,
  getCurrentSession,
  getSessionRequestStatus,
  getStatus,
  makeId,
  publishBinary,
  publishEncryptedBinary,
  type AppSessionStatus,
  type IngressRecord,
  type NodeStatus
} from "./jolt";
import { SPOKE_CAPABILITIES, requestSpokeSession } from "./session";
import {
  tauriSpokeUpdateClient,
  type SpokeUpdateCheck,
  type SpokeUpdateClient
} from "./update/client";

type AppView = "feed" | "profile" | "messages" | "notifications";
type ThemeMode = "light" | "dark";
type NotificationFilter = "all" | "follows" | "replies" | "messages";
type ContactProfilePreviewState = "idle" | "loading" | "found" | "missing";
type HandledNotification = {
  id: string;
  sender: string;
  kind: string;
  status: "accepted" | "rejected";
  at: string;
};

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

type SpokeIncomingPayload =
  | SpokeReply
  | SpokeReplyV2
  | SpokeFollowRequest
  | SpokeFollowResponse
  | SpokeMessage;

const SESSION_KEY = "spoke.session";
const CONTACTS_KEY = "spoke.contacts";
const PROFILE_KEY = "spoke.profile";
const THEME_KEY = "spoke.theme";
const FEED_REFRESH_MS = 2000;
const INCOMING_REFRESH_MS = 2000;
const CONVERSATION_REFRESH_MS = 3000;
const MEDIA_RETRY_MS = 5000;

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

function messageAttachmentKey(messageId: string, attachment: SpokeMessageAttachment) {
  return `${messageId}:${attachmentKey(attachment)}`;
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

function isSpokeReply(value: unknown): value is SpokeReply {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { schema?: unknown }).schema === "spoke.reply.v1"
  );
}

function replyDraftKey(postId: string, parentId: string) {
  return `${postId}:${parentId}`;
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
    return messagePreview(payload);
  }
  return payload.body;
}

function isAnyReply(payload: unknown): payload is SpokeReply | SpokeReplyV2 {
  return isSpokeReply(payload) || isReplyV2(payload);
}

// Validate an already-parsed ingress payload (from jolt.openIngress) into a known
// Spoke incoming object for display/review, or null if unrecognised.
function asIncomingPayload(value: unknown): SpokeIncomingPayload | null {
  if (
    isAnyReply(value) ||
    isSpokeFollowRequest(value) ||
    isSpokeFollowResponse(value) ||
    isSpokeMessage(value)
  ) {
    return value;
  }
  return null;
}

function acceptNoticeFor(payload: SpokeIncomingPayload | undefined): string {
  if (!payload) return "Accepted.";
  if (isSpokeFollowRequest(payload)) return "Follow request accepted.";
  if (isSpokeFollowResponse(payload)) {
    return payload.decision === "accepted"
      ? "Follow request accepted by recipient."
      : "Follow request rejected by recipient.";
  }
  if (isSpokeMessage(payload)) return "Message accepted into the local conversation.";
  if (isReplyV2(payload)) return "Reply accepted and added to the thread.";
  return "Legacy reply acknowledged.";
}

function notificationFilterForPayload(payload?: SpokeIncomingPayload | null): NotificationFilter {
  if (!payload) return "all";
  if (isSpokeFollowRequest(payload) || isSpokeFollowResponse(payload)) return "follows";
  if (isSpokeMessage(payload)) return "messages";
  return "replies";
}

function notificationFilterForRecord(record: IngressRecord, payload?: SpokeIncomingPayload | null): NotificationFilter {
  const payloadFilter = notificationFilterForPayload(payload);
  if (payloadFilter !== "all") {
    return payloadFilter;
  }
  if (record.schema_hint?.includes("follow")) return "follows";
  if (record.schema_hint?.includes("message")) return "messages";
  if (record.schema_hint?.includes("reply")) return "replies";
  return "all";
}

function notificationGroupLabel(receivedAt: number) {
  const date = new Date(receivedAt * 1000);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return "Today";
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function App() {
  const [status, setStatus] = useState<NodeStatus | null>(null);
  const [session, setSession] = useState<StoredSession>(() =>
    loadJson<StoredSession>(SESSION_KEY, { requestId: "", status: "pending" })
  );
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() =>
    normalizeProfileDraft(loadJson<Partial<ProfileDraft>>(PROFILE_KEY, {
      displayName: "",
      bio: "",
      location: "",
      pronouns: "",
      links: []
    }))
  );
  const [profileAvatar, setProfileAvatar] = useState<PendingImageAttachment | null>(null);
  // Profiles are read from the monotonic store through the query seam, not from
  // React state. publishProfile/loadProfile commands fold writes into the store.
  const profileCache = useProfiles();
  const [profileAvatarUrls, setProfileAvatarUrls] = useState<Record<string, string>>({});
  const [profileAvatarErrors, setProfileAvatarErrors] = useState<Record<string, string>>({});
  const [activeProfileIdentity, setActiveProfileIdentity] = useState("");
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => loadJson<ThemeMode>(THEME_KEY, "light"));
  const [contactDraft, setContactDraft] = useState<Contact>({
    identity: "",
    displayName: ""
  });
  const [followMessageDraft, setFollowMessageDraft] = useState("");
  const [postDraft, setPostDraft] = useState({ title: "", body: "" });
  const [postAttachments, setPostAttachments] = useState<PendingImageAttachment[]>([]);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [attachmentErrors, setAttachmentErrors] = useState<Record<string, string>>({});
  const [activeView, setActiveView] = useState<AppView>("feed");
  const [activeThreadId, setActiveThreadId] = useState("");
  const [incoming, setIncoming] = useState<IngressRecord[]>([]);
  const [notificationFilter, setNotificationFilter] = useState<NotificationFilter>("all");
  const [handledNotifications, setHandledNotifications] = useState<HandledNotification[]>([]);
  const [review, setReview] = useState<ReviewState>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [threadSearch, setThreadSearch] = useState("");
  const [messageAttachments, setMessageAttachments] = useState<Record<string, PendingImageAttachment[]>>({});
  const [messageAttachmentUrls, setMessageAttachmentUrls] = useState<Record<string, string>>({});
  const [messageAttachmentErrors, setMessageAttachmentErrors] = useState<Record<string, string>>({});
  const [contactProfilePreview, setContactProfilePreview] = useState<SpokeProfile | null>(null);
  const [contactProfilePreviewState, setContactProfilePreviewState] =
    useState<ContactProfilePreviewState>("idle");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [updateCheck, setUpdateCheck] = useState<SpokeUpdateCheck | null>(null);
  const [updateAction, setUpdateAction] = useState<"check" | "install" | null>(null);
  const [sessionValidated, setSessionValidated] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [mediaRetryTick, setMediaRetryTick] = useState(0);
  const feedRefreshInFlight = useRef(false);
  const incomingRefreshInFlight = useRef(false);
  const conversationRefreshInFlight = useRef(false);
  const feedRefreshGeneration = useRef(0);
  const pendingAttachmentUrlsRef = useRef<string[]>([]);
  const fetchedAttachmentUrlsRef = useRef<Set<string>>(new Set());
  const fetchingAttachmentKeysRef = useRef<Set<string>>(new Set());
  const attachmentRetryAfterRef = useRef<Record<string, number>>({});
  const messageAttachmentUrlsRef = useRef<Set<string>>(new Set());
  const fetchingMessageAttachmentKeysRef = useRef<Set<string>>(new Set());
  const messageAttachmentRetryAfterRef = useRef<Record<string, number>>({});
  const profileAvatarUrlsRef = useRef<Set<string>>(new Set());
  const fetchingProfileAvatarKeysRef = useRef<Set<string>>(new Set());
  const profileAvatarRetryAfterRef = useRef<Record<string, number>>({});
  const fetchingProfileKeysRef = useRef<Set<string>>(new Set());
  const profileRetryAfterRef = useRef<Record<string, number>>({});
  const updateClient: SpokeUpdateClient = tauriSpokeUpdateClient;

  const sessionToken = session.token || "";
  const jolt = useMemo(() => createJoltSdk(() => sessionToken), [sessionToken]);
  const localIdentity = session.identity || status?.identity_address || "";
  const canUseApp = Boolean(sessionToken && session.status === "active" && sessionValidated);

  // Contacts and conversations are Projections read from the monotonic store
  // through the query seams (cards 101/103), never React state. Commands and the
  // inbox loop fold writes into the store; these hooks re-render off it.
  const contacts = useContacts(localIdentity);
  const conversations = useConversations(localIdentity);

  // The feed reads from the monotonic store through the query seam; enumeration
  // discovers posts via Jolt's append-record enumeration (J1, card 104).
  const enumeration = useMemo(() => createJoltEnumeration(jolt), [jolt]);
  const feed = useFeed({ localIdentity, contacts });

  // Threads are author-anchored: the bridge enumerates the post author's
  // accepted-reply Collection (swappable for J1 in card 104). useThreads
  // projects one nested tree per visible post from the monotonic store.
  const threadBridge = useMemo(() => createJoltThreadEnumeration(jolt), [jolt]);
  const threadScopes = useMemo<ThreadScope[]>(
    () => feed.map((item) => ({ postId: item.post.id, postAuthor: item.post.author, localIdentity })),
    [feed, localIdentity]
  );
  const threadsByPost = useThreads(threadScopes);

  // The inbox seam owns the ingress loop; handlers dispatch decoded payloads to
  // the follow/message/thread commands. App only kicks processInbox and renders
  // the records left for manual review.
  const inboxHandlers = useMemo(() => createInboxHandlers({ threadBridge }), [threadBridge]);
  const inboxContext = useMemo(() => ({ localIdentity }), [localIdentity]);

  const localPosts = useMemo(
    () => feed.filter((item) => item.source === "local").length,
    [feed]
  );
  const localFeedItems = useMemo(() => feed.filter((item) => item.source === "local"), [feed]);
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
    return displayNameForProfileIdentity({
      identity,
      localIdentity,
      localDisplayName: profileDraft.displayName,
      contacts,
      profiles: profileCache
    });
  };
  const contactDisplayName = (contact: Contact) => displayNameForIdentity(contact.identity);
  const activeProfile = activeProfileIdentity
    ? sameIdentity(activeProfileIdentity, localIdentity)
      ? ({
          schema: profileDraft.avatar ||
            profileDraft.links.length ||
            profileDraft.location.trim() ||
            profileDraft.pronouns.trim()
            ? "spoke.profile.v2"
            : "spoke.profile.v1",
          identity: localIdentity,
          displayName: profileDraft.displayName,
          bio: profileDraft.bio,
          avatar: profileDraft.avatar,
          links: profileLinksFromDraft(profileDraft.links),
          location: profileDraft.location,
          pronouns: profileDraft.pronouns,
          updatedAt: ""
        } satisfies SpokeProfile)
      : Object.entries(profileCache).find(([profileIdentity]) =>
          sameIdentity(profileIdentity, activeProfileIdentity)
        )?.[1]
    : null;
  const messageThreads = useMemo<MessageThread[]>(() => {
    if (!localIdentity) {
      return [];
    }

    const threads = new Map<string, MessageThread>();
    for (const contact of acceptedContacts) {
      const id = conversationIdForParticipants([localIdentity, contact.identity]);
      threads.set(id, {
        id,
        contact: { ...contact, displayName: contactDisplayName(contact) },
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
  }, [acceptedContacts, conversationList, conversations, localIdentity, contacts, profileDraft.displayName, profileCache]);
  const activeThread = useMemo(() => {
    return messageThreads.find((thread) => thread.id === activeThreadId) || messageThreads[0] || null;
  }, [messageThreads, activeThreadId]);
  const visibleMessageThreads = useMemo(() => {
    const query = threadSearch.trim().toLowerCase();
    if (!query) {
      return messageThreads;
    }
    return messageThreads.filter((thread) => {
      const lastMessage = thread.conversation?.messages[thread.conversation.messages.length - 1];
      return (
        thread.contact.displayName.toLowerCase().includes(query) ||
        thread.contact.identity.toLowerCase().includes(query) ||
        (lastMessage ? messagePreview(lastMessage.message).toLowerCase().includes(query) : false)
      );
    });
  }, [messageThreads, threadSearch]);
  const activeThreadMessages = activeThread?.conversation?.messages || [];
  const filteredNotificationGroups = useMemo(() => {
    const filtered = incoming.filter((record) => {
      const recordFilter = notificationFilterForRecord(record, review[record.ingress_id]?.opened);
      return notificationFilter === "all" || recordFilter === notificationFilter;
    });

    return filtered
      .sort((a, b) => b.received_at - a.received_at)
      .reduce<Array<{ label: string; records: IngressRecord[] }>>((groups, record) => {
        const label = notificationGroupLabel(record.received_at);
        const existing = groups.find((group) => group.label === label);
        if (existing) {
          existing.records.push(record);
        } else {
          groups.push({ label, records: [record] });
        }
        return groups;
      }, []);
  }, [incoming, notificationFilter, review]);
  const feedAttachments = useMemo(
    () => feed.flatMap((item) => item.post.attachments || []),
    [feed]
  );
  const conversationAttachments = useMemo(
    () =>
      Object.values(conversations).flatMap((conversation) =>
        conversation.messages.flatMap((item) =>
          (item.message.attachments || []).map((attachment) => ({
            messageId: item.message.id,
            attachment
          }))
        )
      ),
    [conversations]
  );
  const profileAvatarEntries = useMemo(
    () => {
      const entries: Array<{ identity: string; attachment: SpokeAttachment }> = [];
      if (localIdentity && profileDraft.avatar) {
        entries.push({ identity: localIdentity, attachment: profileDraft.avatar });
      }
      for (const profile of Object.values(profileCache)) {
        if (profile.avatar) {
          entries.push({ identity: profile.identity, attachment: profile.avatar });
        }
      }
      return entries;
    },
    [localIdentity, profileCache, profileDraft.avatar]
  );
  const visibleProfileIdentities = useMemo(() => {
    const seen = new Set<string>();
    const identities: string[] = [];
    const addIdentity = (identity?: string | null) => {
      if (!identity || sameIdentity(identity, localIdentity)) {
        return;
      }
      const key = profileCacheKey(identity);
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      identities.push(identity);
    };

    for (const contact of contacts) addIdentity(contact.identity);
    for (const thread of messageThreads) addIdentity(thread.contact.identity);
    for (const item of feed) addIdentity(item.post.author);
    for (const nodes of Object.values(threadsByPost)) {
      for (const node of flattenThread(nodes)) addIdentity(node.sender);
    }
    for (const record of incoming) addIdentity(record.sender_identity);
    addIdentity(activeProfileIdentity);
    return identities;
  }, [activeProfileIdentity, contacts, feed, incoming, localIdentity, messageThreads, threadsByPost]);

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
      for (const url of messageAttachmentUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      for (const url of profileAvatarUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  // Card 103: the contact graph and conversations are read from the monotonic
  // store, not localStorage. On session start, back-fill any legacy localStorage
  // contacts into the encrypted Collection (ADR 0004) once, then hydrate both
  // graphs from the node. The old CONTACTS_KEY stays as a read-only fallback.
  useEffect(() => {
    if (!canUseApp || !localIdentity) {
      return;
    }
    let cancelled = false;
    void (async () => {
      await migrateLegacyContacts();
      if (cancelled) return;
      await Promise.all([
        loadContacts(jolt, localIdentity).catch(() => {}),
        loadConversations(jolt, localIdentity).catch(() => {})
      ]);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseApp, jolt, localIdentity]);

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
    document.documentElement.classList.toggle("dark", theme === "dark");
    saveJson(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    saveJson(SESSION_KEY, session);
  }, [session]);

  useEffect(() => {
    if (!canUseApp) {
      return;
    }
    const timer = window.setInterval(() => setMediaRetryTick((current) => current + 1), MEDIA_RETRY_MS);
    return () => window.clearInterval(timer);
  }, [canUseApp]);

  useEffect(() => {
    if (!canUseApp || !sessionToken || visibleProfileIdentities.length === 0) {
      return;
    }

    let cancelled = false;
    const now = Date.now();
    for (const identity of visibleProfileIdentities) {
      const key = profileCacheKey(identity);
      if (
        profileCache[key] ||
        (profileRetryAfterRef.current[key] || 0) > now ||
        fetchingProfileKeysRef.current.has(key)
      ) {
        continue;
      }

      fetchingProfileKeysRef.current.add(key);
      loadProfile(jolt, identity)
        .then((profile) => {
          if (cancelled) {
            return;
          }
          if (profile) {
            delete profileRetryAfterRef.current[key];
          } else {
            profileRetryAfterRef.current[key] = Date.now() + MEDIA_RETRY_MS;
          }
        })
        .catch(() => {
          if (!cancelled) {
            profileRetryAfterRef.current[key] = Date.now() + MEDIA_RETRY_MS;
          }
        })
        .finally(() => {
          fetchingProfileKeysRef.current.delete(key);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [canUseApp, jolt, mediaRetryTick, profileCache, sessionToken, visibleProfileIdentities]);

  useEffect(() => {
    if (!canUseApp || !sessionToken || feedAttachments.length === 0) {
      return;
    }

    let cancelled = false;
    const now = Date.now();
    for (const attachment of feedAttachments) {
      const key = attachmentKey(attachment);
      const target = attachmentFetchTarget(attachment);
      if (
        !target ||
        attachmentUrls[key] ||
        (attachmentRetryAfterRef.current[key] || 0) > now ||
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
          delete attachmentRetryAfterRef.current[key];
          setAttachmentErrors((current) => {
            if (!current[key]) return current;
            const next = { ...current };
            delete next[key];
            return next;
          });
        })
        .catch((err) => {
          if (!cancelled) {
            attachmentRetryAfterRef.current[key] = Date.now() + MEDIA_RETRY_MS;
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
  }, [attachmentUrls, canUseApp, feedAttachments, mediaRetryTick, sessionToken]);

  useEffect(() => {
    if (!canUseApp || !sessionToken || conversationAttachments.length === 0) {
      return;
    }

    let cancelled = false;
    const now = Date.now();
    for (const { messageId, attachment } of conversationAttachments) {
      const key = messageAttachmentKey(messageId, attachment);
      const target = attachmentFetchTarget(attachment);
      if (
        !target ||
        messageAttachmentUrls[key] ||
        (messageAttachmentRetryAfterRef.current[key] || 0) > now ||
        fetchingMessageAttachmentKeysRef.current.has(key)
      ) {
        continue;
      }

      fetchingMessageAttachmentKeysRef.current.add(key);
      decryptEncryptedTarget(sessionToken, target)
        .then((result) => {
          if (cancelled) {
            return;
          }
          const blob = new Blob([new Uint8Array(result.plaintext)], { type: attachment.mimeType });
          const url = URL.createObjectURL(blob);
          messageAttachmentUrlsRef.current.add(url);
          setMessageAttachmentUrls((current) => ({ ...current, [key]: url }));
          delete messageAttachmentRetryAfterRef.current[key];
          setMessageAttachmentErrors((current) => {
            if (!current[key]) return current;
            const next = { ...current };
            delete next[key];
            return next;
          });
        })
        .catch((err) => {
          if (!cancelled) {
            messageAttachmentRetryAfterRef.current[key] = Date.now() + MEDIA_RETRY_MS;
            setMessageAttachmentErrors((current) => ({ ...current, [key]: apiErrorMessage(err) }));
          }
        })
        .finally(() => {
          fetchingMessageAttachmentKeysRef.current.delete(key);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    canUseApp,
    conversationAttachments,
    messageAttachmentUrls,
    mediaRetryTick,
    sessionToken
  ]);

  useEffect(() => {
    if (!canUseApp || !sessionToken || profileAvatarEntries.length === 0) {
      return;
    }

    let cancelled = false;
    const now = Date.now();
    for (const { identity, attachment } of profileAvatarEntries) {
      const key = profileCacheKey(identity);
      const target = attachmentFetchTarget(attachment);
      if (
        !target ||
        profileAvatarUrls[key] ||
        (profileAvatarRetryAfterRef.current[key] || 0) > now ||
        fetchingProfileAvatarKeysRef.current.has(key)
      ) {
        continue;
      }

      fetchingProfileAvatarKeysRef.current.add(key);
      fetchTarget(sessionToken, target)
        .then((result) => {
          if (cancelled) {
            return;
          }
          const blob = new Blob([new Uint8Array(result.data)], { type: attachment.mimeType });
          const url = URL.createObjectURL(blob);
          profileAvatarUrlsRef.current.add(url);
          setProfileAvatarUrls((current) => ({ ...current, [key]: url }));
          delete profileAvatarRetryAfterRef.current[key];
          setProfileAvatarErrors((current) => {
            if (!current[key]) return current;
            const next = { ...current };
            delete next[key];
            return next;
          });
        })
        .catch((err) => {
          if (!cancelled) {
            profileAvatarRetryAfterRef.current[key] = Date.now() + MEDIA_RETRY_MS;
            setProfileAvatarErrors((current) => ({ ...current, [key]: apiErrorMessage(err) }));
          }
        })
        .finally(() => {
          fetchingProfileAvatarKeysRef.current.delete(key);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [
    canUseApp,
    profileAvatarEntries,
    profileAvatarUrls,
    mediaRetryTick,
    sessionToken
  ]);

  useEffect(() => {
    if (!canUseApp || !sessionToken || incoming.length === 0) {
      return;
    }

    const identities = Array.from(
      new Set(incoming.map((record) => record.sender_identity).filter(Boolean))
    ).filter((identity) => !profileCache[profileCacheKey(identity)]);

    for (const identity of identities) {
      // Some senders will not have a public Spoke profile yet; loadProfile
      // folds any hit into the store and is a no-op otherwise.
      loadProfile(jolt, identity).catch(() => {});
    }
  }, [canUseApp, incoming, jolt, profileCache, sessionToken]);

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
      let avatar = profileDraft.avatar;
      if (profileAvatar) {
        const publishedAvatar = await publishBinary(
          sessionToken,
          mediaPath(profileAvatar.id),
          profileAvatar.file,
          {
            fileName: profileAvatar.file.name || `${profileAvatar.id}.image`,
            mimeType: profileAvatar.mimeType
          }
        );
        avatar = createImageAttachmentReference({
          id: profileAvatar.id,
          published: publishedAvatar,
          mimeType: profileAvatar.mimeType,
          width: profileAvatar.width,
          height: profileAvatar.height,
          alt: `${profileDraft.displayName.trim() || localIdentity} avatar`
        });
        const url = URL.createObjectURL(profileAvatar.file);
        profileAvatarUrlsRef.current.add(url);
        setProfileAvatarUrls((current) => ({ ...current, [profileCacheKey(localIdentity)]: url }));
      }
      const links = profileLinksFromDraft(profileDraft.links);
      const profile: SpokeProfile = {
        schema: avatar || links.length || profileDraft.location.trim() || profileDraft.pronouns.trim()
          ? "spoke.profile.v2"
          : "spoke.profile.v1",
        identity: localIdentity,
        displayName: profileDraft.displayName.trim() || localIdentity,
        bio: profileDraft.bio.trim(),
        ...(avatar ? { avatar } : {}),
        ...(links.length ? { links } : {}),
        ...(profileDraft.location.trim() ? { location: profileDraft.location.trim() } : {}),
        ...(profileDraft.pronouns.trim() ? { pronouns: profileDraft.pronouns.trim() } : {}),
        updatedAt: new Date().toISOString()
      };
      await publishProfile(jolt, profile);
      if (profileAvatar) {
        URL.revokeObjectURL(profileAvatar.previewUrl);
      }
      setProfileAvatar(null);
      setProfileDraft((current) => ({ ...current, avatar }));
      setShowProfileEditor(false);
      setNotice(
        profile.schema === "spoke.profile.v2"
          ? "Rich profile published at /spoke/profile."
          : "Profile published at /spoke/profile."
      );
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

  async function prepareImageAttachments(files: File[]) {
    const nextAttachments: PendingImageAttachment[] = [];
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
      return nextAttachments;
    } catch (err) {
      for (const attachment of nextAttachments) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      throw err;
    }
  }

  async function addPostAttachments(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (files.length === 0) {
      return;
    }

    setError("");
    setNotice("");
    let nextAttachments: PendingImageAttachment[] = [];
    try {
      nextAttachments = await prepareImageAttachments(files);
    } catch (err) {
      setError(apiErrorMessage(err));
      return;
    }

    setPostAttachments((current) => [...current, ...nextAttachments]);
  }

  async function addProfileAvatar(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []).slice(0, 1);
    event.currentTarget.value = "";
    if (files.length === 0) {
      return;
    }

    setError("");
    setNotice("");
    try {
      const [nextAvatar] = await prepareImageAttachments(files);
      setProfileAvatar((current) => {
        if (current) {
          URL.revokeObjectURL(current.previewUrl);
        }
        return nextAvatar;
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  function removeProfileAvatar() {
    if (profileAvatar) {
      URL.revokeObjectURL(profileAvatar.previewUrl);
      setProfileAvatar(null);
      return;
    }
    setProfileAvatarUrls((current) => {
      const next = { ...current };
      delete next[profileCacheKey(localIdentity)];
      return next;
    });
    setProfileAvatarErrors((current) => {
      const next = { ...current };
      delete next[profileCacheKey(localIdentity)];
      return next;
    });
    setProfileDraft((current) => ({ ...current, avatar: undefined }));
  }

  function updateProfileLink(index: number, key: keyof SpokeProfileLink, value: string) {
    setProfileDraft((current) => ({
      ...current,
      links: current.links.map((link, itemIndex) =>
        itemIndex === index ? { ...link, [key]: value } : link
      )
    }));
  }

  function addProfileLink() {
    setProfileDraft((current) => ({
      ...current,
      links: [...current.links, { label: "", url: "" }]
    }));
  }

  function removeProfileLink(index: number) {
    setProfileDraft((current) => ({
      ...current,
      links: current.links.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  async function addMessageAttachments(identity: string, event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = "";
    if (files.length === 0) {
      return;
    }

    setError("");
    setNotice("");
    let nextAttachments: PendingImageAttachment[] = [];
    try {
      nextAttachments = await prepareImageAttachments(files);
    } catch (err) {
      setError(apiErrorMessage(err));
      return;
    }

    setMessageAttachments((current) => ({
      ...current,
      [identity]: [...(current[identity] || []), ...nextAttachments]
    }));
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

  function removeMessageAttachment(identity: string, id: string) {
    setMessageAttachments((current) => {
      const attachments = current[identity] || [];
      const attachment = attachments.find((item) => item.id === id);
      if (attachment) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      return {
        ...current,
        [identity]: attachments.filter((item) => item.id !== id)
      };
    });
  }

  function updateMessageAttachmentAlt(identity: string, id: string, alt: string) {
    setMessageAttachments((current) => ({
      ...current,
      [identity]: (current[identity] || []).map((attachment) =>
        attachment.id === id ? { ...attachment, alt } : attachment
      )
    }));
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
        threadPath: makeAcceptedPrefix(id),
        ...(attachments.length > 0 ? { attachments } : {})
      };
      // Publish the post (Append Record), record it in the bridge index, and
      // fold it into the store. The post appears in the feed Projection at once
      // because the store update is synchronous after the publish resolves.
      await publishPostCommand(jolt, post);
      feedRefreshGeneration.current += 1;
      for (const attachment of attachments) {
        const pendingAttachment = postAttachments.find((item) => item.id === attachment.id);
        if (pendingAttachment) {
          const url = URL.createObjectURL(pendingAttachment.file);
          fetchedAttachmentUrlsRef.current.add(url);
          setAttachmentUrls((current) => ({ ...current, [attachmentKey(attachment)]: url }));
        }
      }
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

  // One-time back-fill of legacy localStorage contacts into the encrypted
  // Collection (ADR 0004). Idempotent via a migration flag; best-effort per edge.
  async function migrateLegacyContacts() {
    const migratedKey = `${CONTACTS_KEY}.migrated`;
    if (loadJson<boolean>(migratedKey, false)) {
      return;
    }
    const legacy = loadJson<Contact[]>(CONTACTS_KEY, []);
    for (const contact of legacy) {
      try {
        await publishContact(jolt, localIdentity, {
          identity: contact.identity,
          displayName: contact.displayName || contact.identity,
          relationship: contact.relationship || "accepted"
        });
      } catch {
        // loadContacts will still surface whatever landed.
      }
    }
    saveJson(migratedKey, true);
  }

  async function addContact() {
    const identity = contactDraft.identity.trim();
    if (!identity) {
      setError("Contact identity is required.");
      return;
    }
    const displayName = contactDraft.displayName.trim() || identity;
    await addContactCommand(jolt, localIdentity, { identity, displayName });
    setContactDraft({ identity: "", displayName: "" });
    void loadFeedSnapshot([...contacts, { identity, displayName, relationship: "local" }]);
  }

  async function sendFollowRequest() {
    const identity = contactDraft.identity.trim();
    if (!identity) {
      setError("Contact identity is required.");
      return;
    }

    await withBusy("follow", async () => {
      await requestFollow(jolt, localIdentity, {
        identity,
        displayName: contactDraft.displayName.trim() || identity,
        message: followMessageDraft.trim(),
        fromDisplayName: profileDraft.displayName.trim() || localIdentity
      });
      setContactDraft({ identity: "", displayName: "" });
      setFollowMessageDraft("");
      setNotice("Follow request sent through encrypted ingress.");
    });
  }

  useEffect(() => {
    if (!showContactsModal || !canUseApp || !sessionToken) {
      setContactProfilePreview(null);
      setContactProfilePreviewState("idle");
      return;
    }

    const identity = contactDraft.identity.trim();
    if (!identity) {
      setContactProfilePreview(null);
      setContactProfilePreviewState("idle");
      return;
    }

    let cancelled = false;
    setContactProfilePreview(null);
    setContactProfilePreviewState("loading");
    const timer = window.setTimeout(() => {
      loadProfile(jolt, identity)
        .then((profile) => {
          if (cancelled) return;
          if (profile) {
            setContactProfilePreview(profile);
            setContactProfilePreviewState("found");
          } else {
            setContactProfilePreview(null);
            setContactProfilePreviewState("missing");
          }
        })
        .catch(() => {
          if (cancelled) return;
          setContactProfilePreview(null);
          setContactProfilePreviewState("missing");
        });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [showContactsModal, canUseApp, jolt, sessionToken, contactDraft.identity]);


  async function loadFeedSnapshot(nextContacts = contacts) {
    const feedContacts = activeContacts(nextContacts);
    const generation = ++feedRefreshGeneration.current;
    setFeedRefreshing(true);
    const identities = [localIdentity, ...feedContacts.map((contact) => contact.identity)].filter(
      Boolean
    );

    // Hydrate profiles (card 101) and posts (card 102) into the monotonic store
    // through the loader seam. Both merges are additive and monotonic: a stale
    // or incomplete read can never drop a record another reader confirmed, so
    // the timeline no longer needs snapshot-merge gymnastics.
    await Promise.all(identities.map((identity) => loadProfile(jolt, identity).catch(() => null)));
    await loadFeed(jolt, enumeration, identities);

    if (generation === feedRefreshGeneration.current) {
      setFeedRefreshing(false);
    }

    // Threads (card 091): for each visible post, enumerate the author's
    // accepted-reply Collection and fold the replies into the store. Additive
    // and monotonic; an incomplete refresh cannot drop an accepted reply.
    const feedItems = readFeed({ localIdentity, contacts: nextContacts });
    await Promise.all(
      feedItems.map((item) =>
        loadThread(jolt, threadBridge, item.post.author, item.post.id).catch(() => {})
      )
    );
  }

  async function refreshConversationsSilently() {
    if (conversationRefreshInFlight.current) {
      return;
    }
    conversationRefreshInFlight.current = true;
    try {
      // Hydrate both halves of every conversation into the monotonic store
      // through the message loader seam; useConversations re-projects off it.
      await loadConversations(jolt, localIdentity);
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

  async function sendReply(item: FeedItem, parentId: string) {
    const draftKey = replyDraftKey(item.post.id, parentId);
    const body = (replyDrafts[draftKey] || "").trim();
    if (!body) {
      setError("Reply body is required.");
      return;
    }
    await withBusy(`reply:${draftKey}`, async () => {
      const reply: SpokeReplyV2 = {
        schema: "spoke.reply.v2",
        id: makeId("reply"),
        postId: item.post.id,
        postAuthor: item.post.author,
        // parentId is the post id for a top-level reply, or a reply id to nest.
        parent: parentId,
        sender: localIdentity,
        body,
        createdAt: new Date().toISOString()
      };
      // Publish the reply as an Append Record under our own identity (outbox).
      await submitReply(jolt, reply);
      if (sameIdentity(item.post.author, localIdentity)) {
        // Replying on our own post: we are the gatekeeper, so accept it.
        await acceptReply(jolt, threadBridge, reply);
        setNotice("Reply published to your thread.");
      } else {
        // Notify the post author so their device can gate acceptance.
        await jolt.sendObject(item.post.author, `/spoke/outgoing/${reply.id}`, reply);
        setNotice("Encrypted reply submitted to the post author.");
      }
      setReplyDrafts((current) => ({ ...current, [draftKey]: "" }));
      void refreshFeedSilently();
    });
  }

  async function sendMessage(contact: Contact) {
    const body = (messageDrafts[contact.identity] || "").trim();
    const pendingAttachments = messageAttachments[contact.identity] || [];
    if (!body && pendingAttachments.length === 0) {
      setError("Message body or image is required.");
      return;
    }

    await withBusy(`message:${contact.identity}`, async () => {
      const messageId = makeId("msg");
      const attachments = await Promise.all(
        pendingAttachments.map(async (attachment) => {
          const published = await publishEncryptedBinary(
            sessionToken,
            messageMediaPath(messageId, attachment.id),
            attachment.file,
            {
              mimeType: attachment.mimeType,
              recipients: [contact.identity, localIdentity]
            }
          );
          return createEncryptedImageAttachmentReference({
            id: attachment.id,
            published,
            mimeType: attachment.mimeType,
            width: attachment.width,
            height: attachment.height,
            alt: attachment.alt.trim() || undefined
          });
        })
      );
      const message: SpokeMessage = {
        schema: attachments.length > 0 ? "spoke.message.v2" : "spoke.message.v1",
        id: messageId,
        conversationId: conversationIdForParticipants([localIdentity, contact.identity]),
        sender: localIdentity,
        recipients: [contact.identity],
        body,
        createdAt: new Date().toISOString(),
        ...(attachments.length > 0 ? { attachments } : {})
      };
      // The command validates conversation membership, ingress-sends to the
      // recipient, and folds the sent copy into the store (useConversations
      // re-projects it); no React conversation state to update here.
      await sendMessageCommand(jolt, message);
      for (const attachment of attachments) {
        const pendingAttachment = pendingAttachments.find((item) => item.id === attachment.id);
        if (pendingAttachment) {
          const url = URL.createObjectURL(pendingAttachment.file);
          messageAttachmentUrlsRef.current.add(url);
          setMessageAttachmentUrls((current) => ({
            ...current,
            [messageAttachmentKey(message.id, attachment)]: url
          }));
        }
      }
      setMessageDrafts((current) => ({ ...current, [contact.identity]: "" }));
      for (const attachment of pendingAttachments) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      setMessageAttachments((current) => ({ ...current, [contact.identity]: [] }));
      setNotice(
        attachments.length > 0
          ? "Encrypted message and images submitted to recipient ingress."
          : "Encrypted message submitted to recipient ingress."
      );
    });
  }

  function handleMessageKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, contact: Contact) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    void sendMessage(contact);
  }

  // One ingress pass through the inbox seam: auto-applied records fold straight
  // into the store (re-projected by useContacts/useConversations/useThreads);
  // the rest stay for manual review.
  async function loadIncomingSnapshot() {
    const { visible, autoHandled } = await processInbox(jolt, inboxHandlers, inboxContext);
    setIncoming(visible);
    if (autoHandled.length > 0) {
      setReview((current) => {
        const next = { ...current };
        for (const record of autoHandled) {
          delete next[record.ingress_id];
        }
        return next;
      });
      // A newly accepted follow can add a feed source; refresh the timeline.
      void loadFeedSnapshot();
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
      const payload = asIncomingPayload(await jolt.openIngress(record.ingress_id));
      if (!payload) {
        throw new Error("Unsupported Spoke incoming object.");
      }
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

  function recordHandledNotification(
    record: IngressRecord,
    status: HandledNotification["status"],
    opened?: SpokeIncomingPayload
  ) {
    setHandledNotifications((current) => [
      {
        id: record.ingress_id,
        sender: record.sender_identity,
        kind: opened ? incomingKind(opened) : record.schema_hint || "encrypted object",
        status,
        at: new Date().toISOString()
      },
      ...current.filter((item) => item.id !== record.ingress_id)
    ].slice(0, 6));
  }

  async function acceptIncoming(record: IngressRecord) {
    await withBusy(`accept:${record.ingress_id}`, async () => {
      const opened =
        review[record.ingress_id]?.opened ??
        asIncomingPayload(await jolt.openIngress(record.ingress_id)) ??
        undefined;
      // The matching inbox handler records the contact / persists the message /
      // accepts the reply and folds it into the store; the query hooks re-render.
      await acceptInboxRecord(jolt, inboxHandlers, record.ingress_id, opened, inboxContext);
      setIncoming((current) => current.filter((item) => item.ingress_id !== record.ingress_id));
      recordHandledNotification(record, "accepted", opened);
      // Accepting a follow or message may change feed scope; refresh.
      void loadFeedSnapshot();
      setNotice(acceptNoticeFor(opened));
    });
  }

  async function rejectIncoming(record: IngressRecord) {
    await withBusy(`reject:${record.ingress_id}`, async () => {
      const opened =
        review[record.ingress_id]?.opened ??
        asIncomingPayload(await jolt.openIngress(record.ingress_id).catch(() => null)) ??
        undefined;
      await rejectInboxRecord(jolt, inboxHandlers, record.ingress_id, opened, inboxContext);
      setIncoming((current) => current.filter((item) => item.ingress_id !== record.ingress_id));
      recordHandledNotification(record, "rejected", opened);
      setNotice("Incoming object rejected.");
    });
  }

  function avatarUrlForIdentity(identity: string) {
    return profileAvatarUrls[profileCacheKey(identity)] || "";
  }

  function avatarInitial(identity: string) {
    return displayNameForIdentity(identity).slice(0, 1).toUpperCase() || "?";
  }

  function markAttachmentImageFailed(key: string) {
    const url = attachmentUrls[key];
    if (url) {
      URL.revokeObjectURL(url);
      fetchedAttachmentUrlsRef.current.delete(url);
    }
    attachmentRetryAfterRef.current[key] = Date.now() + MEDIA_RETRY_MS;
    setAttachmentUrls((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setAttachmentErrors((current) => ({ ...current, [key]: "Image could not be rendered." }));
  }

  function markMessageImageFailed(key: string) {
    const url = messageAttachmentUrls[key];
    if (url) {
      URL.revokeObjectURL(url);
      messageAttachmentUrlsRef.current.delete(url);
    }
    messageAttachmentRetryAfterRef.current[key] = Date.now() + MEDIA_RETRY_MS;
    setMessageAttachmentUrls((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setMessageAttachmentErrors((current) => ({ ...current, [key]: "Image could not be rendered." }));
  }

  function markAvatarImageFailed(identity: string) {
    const key = profileCacheKey(identity);
    const url = profileAvatarUrls[key];
    if (url) {
      URL.revokeObjectURL(url);
      profileAvatarUrlsRef.current.delete(url);
    }
    profileAvatarRetryAfterRef.current[key] = Date.now() + MEDIA_RETRY_MS;
    setProfileAvatarUrls((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setProfileAvatarErrors((current) => ({ ...current, [key]: "Avatar could not be rendered." }));
  }

  function profileForIdentity(identity: string) {
    if (sameIdentity(identity, localIdentity)) {
      return activeProfile && sameIdentity(activeProfile.identity, localIdentity)
        ? activeProfile
        : profileCache[profileCacheKey(localIdentity)];
    }
    return Object.entries(profileCache).find(([profileIdentity]) =>
      sameIdentity(profileIdentity, identity)
    )?.[1];
  }

  function renderAvatar(identity: string, size: "small" | "large" = "small") {
    const url = avatarUrlForIdentity(identity);
    return (
      <Avatar className={cn(size === "large" ? "size-16 text-lg" : "size-9")}>
        {url ? <AvatarImage src={url} alt="" onError={() => markAvatarImageFailed(identity)} /> : null}
        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent font-semibold text-primary">
          {avatarInitial(identity)}
        </AvatarFallback>
      </Avatar>
    );
  }

  function openProfile(identity: string) {
    if (sameIdentity(identity, localIdentity)) {
      setActiveView("profile");
      setActiveProfileIdentity("");
      return;
    }
    setActiveProfileIdentity(identity);
  }

  function profileForDisplay(identity: string) {
    if (sameIdentity(identity, localIdentity)) {
      return {
        schema: profileDraft.avatar ||
          profileDraft.links.length ||
          profileDraft.location.trim() ||
          profileDraft.pronouns.trim()
          ? "spoke.profile.v2"
          : "spoke.profile.v1",
        identity: localIdentity,
        displayName: profileDraft.displayName.trim() || localIdentity,
        bio: profileDraft.bio,
        avatar: profileDraft.avatar,
        links: profileLinksFromDraft(profileDraft.links),
        location: profileDraft.location,
        pronouns: profileDraft.pronouns,
        updatedAt: ""
      } satisfies SpokeProfile;
    }
    return profileForIdentity(identity);
  }

  function renderProfileDetails(identity: string) {
    const profile = profileForDisplay(identity);
    return (
      <div className="grid gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {renderAvatar(identity, "large")}
          <div className="min-w-0 space-y-2">
            <div>
              <h2 className="truncate text-2xl font-semibold tracking-tight">
                {displayNameForIdentity(identity)}
              </h2>
              <p className="break-all text-sm text-muted-foreground">{identity}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile?.pronouns ? <Badge variant="secondary">{profile.pronouns}</Badge> : null}
              {profile?.location ? (
                <Badge variant="outline" className="gap-1">
                  <MapPin className="size-3" />
                  {profile.location}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
        {profile?.bio ? (
          <p className="max-w-2xl whitespace-pre-wrap text-sm leading-6 text-foreground/85">{profile.bio}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No published profile details yet.</p>
        )}
        {profile?.links?.length ? (
          <div className="flex flex-wrap gap-2">
            {profile.links.map((link) => (
              <a
                className="inline-flex h-8 items-center gap-2 rounded-md bg-muted px-3 text-sm hover:bg-muted/80"
                href={link.url}
                key={`${link.label}:${link.url}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-3.5" />
                {link.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderProfileEditorForm() {
    return (
      <div className="grid gap-5 px-5 py-5">
        <div className="grid gap-4 rounded-lg border spoke-border bg-muted/25 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <div className="relative size-20">
            <Avatar className="size-20 text-xl">
              {profileAvatar ? (
                <AvatarImage src={profileAvatar.previewUrl} alt="" />
              ) : avatarUrlForIdentity(localIdentity) ? (
                <AvatarImage src={avatarUrlForIdentity(localIdentity)} alt="" onError={() => markAvatarImageFailed(localIdentity)} />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-primary/20 to-accent font-semibold text-primary">
                {avatarInitial(localIdentity)}
              </AvatarFallback>
            </Avatar>
          </div>
          <div className="grid gap-2">
            <div>
              <p className="text-sm font-medium">Profile picture</p>
              <p className="text-xs text-muted-foreground">Use a square JPEG, PNG, or WebP image.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <label>
                  <ImagePlus className="size-4" />
                  Choose avatar
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={addProfileAvatar} />
                </label>
              </Button>
              {(profileAvatar || profileDraft.avatar) ? (
                <Button type="button" variant="ghost" size="sm" onClick={removeProfileAvatar}>
                  <Trash2 className="size-4" />
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        </div>
        <label className="grid gap-2 text-sm font-medium">
          Display name
          <Input
            value={profileDraft.displayName}
            onChange={(event) =>
              setProfileDraft((current) => ({ ...current, displayName: event.target.value }))
            }
            placeholder="Alex"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Bio
          <Textarea
            rows={3}
            value={profileDraft.bio}
            onChange={(event) =>
              setProfileDraft((current) => ({ ...current, bio: event.target.value }))
            }
            placeholder="Short note for known contacts"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Pronouns
            <Input
              value={profileDraft.pronouns}
              onChange={(event) =>
                setProfileDraft((current) => ({ ...current, pronouns: event.target.value }))
              }
              placeholder="they/them"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Location
            <Input
              value={profileDraft.location}
              onChange={(event) =>
                setProfileDraft((current) => ({ ...current, location: event.target.value }))
              }
              placeholder="London"
            />
          </label>
        </div>
        <div className="grid gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Links</h3>
            <Button type="button" variant="outline" size="sm" onClick={addProfileLink}>
              <Plus className="size-4" />
              Add
            </Button>
          </div>
          {profileDraft.links.map((link, index) => (
            <div className="grid gap-2 rounded-lg border spoke-border bg-muted/35 p-2 sm:grid-cols-[1fr_1.4fr_auto]" key={index}>
              <Input
                value={link.label}
                onChange={(event) => updateProfileLink(index, "label", event.target.value)}
                placeholder="Label"
              />
              <Input
                value={link.url}
                onChange={(event) => updateProfileLink(index, "url", event.target.value)}
                placeholder="https://example.com"
              />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeProfileLink(index)} title="Remove link">
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderReplyComposer(item: FeedItem, parentId: string, placeholder: string) {
    const draftKey = replyDraftKey(item.post.id, parentId);
    return (
      <div className="flex gap-2">
        <Textarea
          className="min-h-12"
          rows={2}
          value={replyDrafts[draftKey] || ""}
          onChange={(event) =>
            setReplyDrafts((current) => ({ ...current, [draftKey]: event.target.value }))
          }
          placeholder={placeholder}
        />
        <Button
          type="button"
          size="icon-lg"
          onClick={() => sendReply(item, parentId)}
          title="Send reply"
        >
          <MessageCircle className="size-4" />
        </Button>
      </div>
    );
  }

  function renderThreadNode(item: FeedItem, node: ThreadNode) {
    return (
      <div
        className="rounded-lg border spoke-border bg-background/80 p-3 shadow-sm shadow-foreground/5"
        key={node.id}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            className="h-auto gap-2 p-0 hover:bg-transparent"
            type="button"
            onClick={() => openProfile(node.sender)}
            title={`View ${displayNameForIdentity(node.sender)}`}
          >
            {renderAvatar(node.sender)}
            <span className="font-medium">{displayNameForIdentity(node.sender)}</span>
          </Button>
          <time className="text-xs text-muted-foreground">{new Date(node.createdAt).toLocaleString()}</time>
        </div>
        <p className="whitespace-pre-wrap text-sm">{node.body}</p>
        {canUseApp ? (
          <div className="mt-2">
            {renderReplyComposer(item, node.id, `Reply to ${displayNameForIdentity(node.sender)}`)}
          </div>
        ) : null}
        {node.children.length ? (
          <div className="mt-3 space-y-2 border-l spoke-border pl-3">
            {node.children.map((child) => renderThreadNode(item, child))}
          </div>
        ) : null}
      </div>
    );
  }

  function renderPostCard(item: FeedItem) {
    return (
      <Card className="overflow-hidden" key={`${item.source}:${item.address}`}>
        <CardHeader className="bg-muted/20">
          <Button
            variant="ghost"
            className="h-auto justify-start gap-3 p-0 hover:bg-transparent"
            type="button"
            onClick={() => openProfile(item.post.author)}
            title={`View ${displayNameForIdentity(item.post.author)}`}
          >
            {renderAvatar(item.post.author)}
            <span className="min-w-0 text-left">
              <span className="block truncate font-semibold">{displayNameForIdentity(item.post.author)}</span>
              <span className="block truncate text-xs text-muted-foreground">{item.post.author}</span>
            </span>
          </Button>
          <CardAction>
            <time className="text-xs text-muted-foreground">{new Date(item.post.createdAt).toLocaleString()}</time>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold tracking-tight">{item.post.title}</h3>
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/85">{item.post.body}</p>
          </div>
        {item.post.attachments?.length ? (
          <div className={cn("grid gap-2", item.post.attachments.length > 1 ? "sm:grid-cols-2" : "")}>
            {item.post.attachments.map((attachment) => {
              const key = attachmentKey(attachment);
              return (
                <MediaFrame
                  imageClassName="max-h-[520px]"
                  key={key}
                  src={attachmentUrls[key]}
                  error={attachmentErrors[key]}
                  alt={attachment.alt || `${item.post.title} image`}
                  caption={attachment.alt}
                  onError={() => markAttachmentImageFailed(key)}
                />
              );
            })}
          </div>
        ) : null}
        </CardContent>
        <CardFooter className="block space-y-3">
        <div className="grid gap-2">
          {(threadsByPost[item.post.id] || []).map((node) => renderThreadNode(item, node))}
          {(threadsByPost[item.post.id] || []).length === 0 ? (
            <span className="text-sm text-muted-foreground">No replies yet.</span>
          ) : null}
        </div>
        {canUseApp ? renderReplyComposer(item, item.post.id, `Reply to ${displayNameForFeedItem(item)}`) : null}
        </CardFooter>
      </Card>
    );
  }

  function renderComposer() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>New post</CardTitle>
          <CardDescription>Publish to your accepted contacts.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input
            value={postDraft.title}
            onChange={(event) =>
              setPostDraft((current) => ({ ...current, title: event.target.value }))
            }
            placeholder="Post title"
          />
          <Textarea
            className="min-h-28"
            value={postDraft.body}
            onChange={(event) =>
              setPostDraft((current) => ({ ...current, body: event.target.value }))
            }
            rows={4}
            placeholder="Write a note for known contacts"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" size="sm">
              <label>
                <ImagePlus className="size-4" />
                Add images
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPostAttachments} />
              </label>
            </Button>
            <span className="text-xs text-muted-foreground">JPEG, PNG, or WebP up to 5 MB each</span>
          </div>
          {postAttachments.length > 0 ? (
            <div className="grid gap-2">
              {postAttachments.map((attachment) => (
                <AttachmentDraftRow
                  attachment={attachment}
                  formatBytes={formatBytes}
                  key={attachment.id}
                  onAltChange={(alt) => updatePostAttachmentAlt(attachment.id, alt)}
                  onRemove={() => removePostAttachment(attachment.id)}
                />
              ))}
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end">
        <Button type="button" onClick={publishPost} disabled={busy === "post"}>
          <Plus className="size-4" />
          Publish
        </Button>
        </CardFooter>
      </Card>
    );
  }

  function renderContactsPanel() {
    const acceptedPeople = contacts.filter((contact) => contact.relationship === "accepted" || !contact.relationship);
    const pendingPeople = contacts.filter((contact) => contact.relationship && contact.relationship !== "accepted");
    return (
      <section className="grid gap-5 px-5 py-5">
        <div className="grid gap-4 rounded-lg border spoke-border bg-muted/25 p-4">
          <label className="grid gap-2 text-sm font-medium">
            Jolt identity
            <div className="relative">
              <AtSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                value={contactDraft.identity}
                onChange={(event) =>
                  setContactDraft((current) => ({ ...current, identity: event.target.value }))
                }
                placeholder="bob.jolt"
              />
            </div>
          </label>
          <div className="rounded-lg border spoke-border bg-background/80 p-3 shadow-sm shadow-foreground/5">
            {contactProfilePreviewState === "loading" ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Looking for a published Spoke profile...
              </div>
            ) : contactProfilePreview ? (
              <div className="flex gap-3">
                {renderAvatar(contactProfilePreview.identity)}
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="truncate">{contactProfilePreview.displayName}</strong>
                    <Badge variant="secondary">Profile found</Badge>
                  </div>
                  <p className="break-all text-xs text-muted-foreground">{contactProfilePreview.identity}</p>
                  {contactProfilePreview.bio ? (
                    <p className="line-clamp-2 text-sm text-foreground/80">{contactProfilePreview.bio}</p>
                  ) : null}
                </div>
              </div>
            ) : contactProfilePreviewState === "missing" ? (
              <div className="flex items-start gap-3 text-sm">
                <Inbox className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <p className="font-medium">No public Spoke profile found.</p>
                  <p className="text-muted-foreground">You can still send an encrypted follow request.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Search className="size-4" />
                Enter an identity to preview their public profile.
              </div>
            )}
          </div>
          <label className="grid gap-2 text-sm font-medium">
            Local nickname
            <Input
              value={contactDraft.displayName}
              onChange={(event) =>
                setContactDraft((current) => ({ ...current, displayName: event.target.value }))
              }
              placeholder={contactProfilePreview?.displayName || "Bob"}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Request note
            <Textarea
              rows={2}
              value={followMessageDraft}
              onChange={(event) => setFollowMessageDraft(event.target.value)}
              placeholder="Optional intro"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={addContact}>
              <UserCheck className="size-4" />
              Save locally
            </Button>
            <Button type="button" onClick={sendFollowRequest} disabled={busy === "follow"}>
              <UserPlus className="size-4" />
              Request follow
            </Button>
          </div>
        </div>

        <Tabs defaultValue="accepted" className="gap-3">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="accepted">Accepted friends</TabsTrigger>
            <TabsTrigger value="pending">Pending sent</TabsTrigger>
          </TabsList>
          {[
            { value: "accepted", people: acceptedPeople, empty: "No accepted friends yet." },
            { value: "pending", people: pendingPeople, empty: "No pending requests." }
          ].map((group) => (
            <TabsContent value={group.value} className="max-h-56 overflow-y-auto pr-1" key={group.value}>
              <div className="grid gap-2">
              {group.people.map((contact) => (
                <PersonRow
                  badge={contact.relationship || "accepted"}
                  badgeVariant={contact.relationship === "accepted" || !contact.relationship ? "secondary" : "outline"}
                  displayName={contactDisplayName(contact)}
                  identity={contact.identity}
                  key={contact.identity}
                  renderAvatar={renderAvatar}
                  onOpen={() => openProfile(contact.identity)}
                  onRemove={() => {
                    // Tombstone the contact edge (ADR 0004). useContacts drops it
                    // from the Projection, so the feed excludes their posts next render.
                    void removeContact(jolt, localIdentity, contact.identity);
                  }}
                />
              ))}
              {group.people.length === 0 ? (
                <div className="rounded-lg border spoke-border bg-muted/35 p-4 text-sm text-muted-foreground">{group.empty}</div>
              ) : null}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </section>
    );
  }

  function renderContactsModal() {
    return (
      <Dialog open={showContactsModal} onOpenChange={setShowContactsModal}>
        <DialogContent className="max-h-[90vh] max-w-2xl">
          <DialogHeader>
            <DialogTitle>Find people</DialogTitle>
            <DialogDescription>
              Preview a public Spoke profile, save a local nickname, and send a follow request.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(90vh-9rem)] overflow-y-auto">
            {renderContactsPanel()}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowContactsModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function renderProfileEditModal() {
    return (
      <Dialog open={showProfileEditor} onOpenChange={setShowProfileEditor}>
        <DialogContent className="max-h-[90vh] max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>Publish profile details that known contacts can recognise.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(90vh-9rem)] overflow-y-auto">
            {renderProfileEditorForm()}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowProfileEditor(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={publishProfileFromDraft} disabled={busy === "profile"}>
              <Send className="size-4" />
              Save profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  function renderProfileModal() {
    return (
      <Dialog open={Boolean(activeProfileIdentity)} onOpenChange={(open) => !open && setActiveProfileIdentity("")}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Public profile</DialogTitle>
          </DialogHeader>
          {activeProfileIdentity ? renderProfileDetails(activeProfileIdentity) : null}
        </DialogContent>
      </Dialog>
    );
  }

  function renderNotificationCard(record: IngressRecord) {
    const opened = review[record.ingress_id]?.opened;
    const profile = profileForIdentity(record.sender_identity);
    const kind = opened ? incomingKind(opened) : record.schema_hint || "encrypted object";
    const notificationFilter = notificationFilterForRecord(record, opened);
    return (
      <Card size="sm" className="overflow-hidden" key={record.ingress_id}>
        <CardContent className="grid gap-4 pt-3 sm:grid-cols-[auto_1fr_auto]">
          <Button
            variant="ghost"
            className="size-auto self-start p-0 hover:bg-transparent"
            type="button"
            onClick={() => openProfile(record.sender_identity)}
            title={`View ${displayNameForIdentity(record.sender_identity)}`}
          >
            {renderAvatar(record.sender_identity)}
          </Button>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="truncate">{displayNameForIdentity(record.sender_identity)}</strong>
              <Badge variant={notificationFilter === "follows" ? "default" : "secondary"}>
                {kind}
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Clock className="size-3" />
                {new Date(record.received_at * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </Badge>
            </div>
            <p className="break-all text-xs text-muted-foreground">{record.sender_identity}</p>
            {profile?.bio ? <p className="line-clamp-2 text-sm text-foreground/80">{profile.bio}</p> : null}
            {profile?.links?.length ? (
              <div className="flex flex-wrap gap-2">
                {profile.links.slice(0, 2).map((link) => (
                  <a
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs hover:bg-muted/80"
                    href={link.url}
                    key={`${link.label}:${link.url}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <LinkIcon className="size-3" />
                    {link.label}
                  </a>
                ))}
              </div>
            ) : null}
          {opened ? (
            <div className="rounded-lg border spoke-border bg-muted/35 p-3">
              <p className="text-xs font-medium uppercase text-muted-foreground">{incomingKind(opened)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{incomingPreview(opened)}</p>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => openIncoming(record)} title="Open">
              Open
            </Button>
          )}
          {review[record.ingress_id]?.error ? (
            <p className="text-sm text-destructive">{review[record.ingress_id]?.error}</p>
          ) : null}
          </div>
          <div className="flex items-start gap-2 sm:flex-col">
          <Button
            type="button"
            size="icon"
            onClick={() => acceptIncoming(record)}
            disabled={busy === `accept:${record.ingress_id}`}
            title="Accept"
          >
            <Check className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => rejectIncoming(record)}
            disabled={busy === `reject:${record.ingress_id}`}
            title="Reject"
          >
            <X className="size-4" />
          </Button>
          </div>
        </CardContent>
      </Card>
    );
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

  const viewTitle: Record<AppView, { title: string; subtitle: string }> = {
    feed: {
      title: "Feed",
      subtitle: `${localPosts} local posts, ${activeContactCount} active contacts${feedRefreshing ? " - updating..." : ""}`
    },
    profile: {
      title: "Your Profile",
      subtitle: "View your profile and your posts."
    },
    messages: {
      title: "Messages",
      subtitle: `${messageThreads.length} conversation threads`
    },
    notifications: {
      title: "Notifications",
      subtitle: `${incoming.length} pending item${incoming.length === 1 ? "" : "s"}`
    }
  };

  const navItems: Array<{ view: AppView; label: string; icon: typeof Home; badge?: number }> = [
    { view: "feed", label: "Feed", icon: Home },
    { view: "profile", label: "Profile", icon: User },
    { view: "messages", label: "Messages", icon: MessageCircle, badge: conversationList.length },
    { view: "notifications", label: "Notifications", icon: Bell, badge: incoming.length }
  ];

  return (
    <TooltipProvider>
      {!canUseApp ? (
        <main className="grid min-h-screen place-items-center p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <KeyRound className="size-6" />
              </div>
              <CardTitle>Connect Spoke to Jolt</CardTitle>
              <CardDescription>
              Spoke needs scoped access to publish `/spoke/*`, read public Jolt content,
              and review incoming social objects.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-end">
              <Button type="button" onClick={requestSession} disabled={busy === "session"}>
                <KeyRound className="size-4" />
                Request access
              </Button>
            </CardFooter>
          </Card>
        </main>
      ) : (
        <SidebarProvider>
          <Sidebar collapsible="icon">
            <SidebarHeader>
              <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                  S
                </div>
                <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                  <strong className="block leading-none">Spoke</strong>
                  <span className="text-xs text-sidebar-foreground/65">Jolt social</span>
                </div>
              </div>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {navItems.map((item) => {
                      const Icon = item.icon;
                      return (
                        <SidebarMenuItem key={item.view}>
                          <SidebarMenuButton
                            isActive={activeView === item.view}
                            tooltip={item.label}
                            onClick={() => setActiveView(item.view)}
                          >
                            <Icon className="size-4" />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                          {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              <SidebarSeparator />
              <SidebarGroup>
                <SidebarGroupContent className="grid gap-2">
                  <Button type="button" onClick={() => setShowContactsModal(true)} className="justify-start group-data-[collapsible=icon]:px-2">
                    <UserPlus className="size-4" />
                    <span className="group-data-[collapsible=icon]:hidden">Find people</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
                    title={theme === "dark" ? "Use light mode" : "Use dark mode"}
                    className="justify-start group-data-[collapsible=icon]:px-2"
                  >
                    {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                    <span className="group-data-[collapsible=icon]:hidden">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
                  </Button>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <div className="flex items-center gap-3 rounded-lg border spoke-border bg-background/80 p-2 shadow-sm shadow-foreground/5 group-data-[collapsible=icon]:justify-center">
                {renderAvatar(localIdentity)}
                <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                  <strong className="block truncate text-sm">{displayNameForIdentity(localIdentity)}</strong>
                  <span className="block truncate text-xs text-muted-foreground">{displayIdentity(localIdentity)}</span>
                  <Badge variant="secondary" className="mt-1">{session.status}</Badge>
                </div>
              </div>
            </SidebarFooter>
            <SidebarRail />
          </Sidebar>
          <SidebarInset>
            <header className="sticky top-0 z-20 border-b spoke-border bg-background/90 shadow-sm shadow-foreground/5 backdrop-blur">
              <div className="flex min-h-20 flex-wrap items-center justify-between gap-3 px-4 py-3 lg:px-8">
                <div className="flex min-w-0 items-center gap-3">
                  <SidebarTrigger className="md:hidden" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Spoke</p>
                    <h1 className="truncate text-2xl font-semibold tracking-tight">{viewTitle[activeView].title}</h1>
                    <p className="truncate text-sm text-muted-foreground">{viewTitle[activeView].subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {updateCheck?.available ? (
                    <Button type="button" variant="outline" onClick={installSpokeUpdate} disabled={updateAction === "install"} title="Install signed Spoke update">
                      <Download className="size-4" />
                    Update
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" size="icon" onClick={checkSpokeUpdate} disabled={updateAction === "check" || updateAction === "install"} title="Check for Spoke updates">
                    <RefreshCw className="size-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" onClick={refreshSession} disabled={!sessionToken || busy === "session"} title="Refresh session">
                    <ShieldCheck className="size-4" />
                  </Button>
                </div>
              </div>
            </header>

            <main className={cn("mx-auto grid w-full gap-5 p-4 lg:p-8", activeView === "messages" ? "max-w-7xl" : "max-w-5xl")}>
            {error ? <div className="rounded-lg border spoke-border-error bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-sm shadow-destructive/5">{error}</div> : null}
            {notice ? <div className="rounded-lg border spoke-border-notice bg-primary/10 px-3 py-2 text-sm text-primary shadow-sm shadow-primary/5">{notice}</div> : null}

            {activeView === "feed" ? (
              <section className="grid gap-5">
                {renderComposer()}
                <Card size="sm">
                  <CardHeader>
                  <div>
                      <CardTitle>Feed</CardTitle>
                      <CardDescription>{viewTitle.feed.subtitle}</CardDescription>
                  </div>
                    <CardAction>
                      <Button type="button" variant="outline" size="icon" onClick={refreshFeed} disabled={busy === "feed" || feedRefreshing} title="Refresh feed">
                        <RefreshCw className={cn("size-4", feedRefreshing ? "animate-spin" : "")} />
                      </Button>
                    </CardAction>
                  </CardHeader>
                </Card>
                <div className="grid gap-4">
                  {feed.map((item) => renderPostCard(item))}
                  {feed.length === 0 ? (
                    <EmptyState>Publish a post or add a known identity to build the feed.</EmptyState>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeView === "profile" ? (
              <section className="grid gap-5">
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setShowContactsModal(true)} title="Manage known people">
                      <Users className="size-4" />
                      Known people
                    </Button>
                    <Button type="button" onClick={() => setShowProfileEditor(true)} title="Edit profile">
                      <Pencil className="size-4" />
                      Edit profile
                    </Button>
                  </div>
                  </CardHeader>
                  <CardContent>
                  {renderProfileDetails(localIdentity)}
                  </CardContent>
                </Card>
                <Card size="sm">
                  <CardHeader>
                  <div>
                      <CardTitle>Your posts</CardTitle>
                      <CardDescription>{localFeedItems.length} posts published by this identity</CardDescription>
                  </div>
                  </CardHeader>
                </Card>
                <div className="grid gap-4">
                  {localFeedItems.map((item) => renderPostCard(item))}
                  {localFeedItems.length === 0 ? (
                    <EmptyState>Your posts will appear here.</EmptyState>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeView === "messages" ? (
              <MessagesView
                activeThread={activeThread}
                activeThreadMessages={activeThreadMessages}
                busy={busy}
                displayNameForIdentity={displayNameForIdentity}
                formatBytes={formatBytes}
                messageAttachmentErrors={messageAttachmentErrors}
                messageAttachmentKey={messageAttachmentKey}
                messageAttachmentUrls={messageAttachmentUrls}
                messageAttachments={messageAttachments}
                messageDrafts={messageDrafts}
                messageThreads={messageThreads}
                renderAvatar={renderAvatar}
                threadSearch={threadSearch}
                visibleMessageThreads={visibleMessageThreads}
                onAddMessageAttachments={addMessageAttachments}
                onBackToFeed={() => setActiveView("feed")}
                onMessageDraftChange={(identity, value) =>
                  setMessageDrafts((current) => ({ ...current, [identity]: value }))
                }
                onMessageImageFailed={markMessageImageFailed}
                onMessageKeyDown={handleMessageKeyDown}
                onOpenProfile={openProfile}
                onRefreshIncoming={refreshIncoming}
                onRemoveMessageAttachment={removeMessageAttachment}
                onSelectThread={setActiveThreadId}
                onSendMessage={sendMessage}
                onThreadSearchChange={setThreadSearch}
                onUpdateMessageAttachmentAlt={updateMessageAttachmentAlt}
              />
            ) : null}

            {activeView === "notifications" ? (
              <section className="grid gap-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Tabs value={notificationFilter} onValueChange={(value) => setNotificationFilter(value as NotificationFilter)}>
                    <TabsList>
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="follows">Follows</TabsTrigger>
                      <TabsTrigger value="replies">Replies</TabsTrigger>
                      <TabsTrigger value="messages">Messages</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <Button type="button" variant="outline" onClick={refreshIncoming} disabled={busy === "incoming"} title="Refresh notifications">
                    <RefreshCw className="size-4" />
                    Refresh
                  </Button>
                </div>
                <div className="grid gap-5">
                  {handledNotifications.length > 0 ? (
                    <Card size="sm">
                      <CardHeader>
                        <CardTitle>Recent decisions</CardTitle>
                        <CardDescription>Accepted and rejected items from this session.</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-2">
                        {handledNotifications.map((item) => (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border spoke-border bg-background/85 p-2 shadow-sm shadow-foreground/5" key={item.id}>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{displayNameForIdentity(item.sender)}</p>
                              <p className="truncate text-xs text-muted-foreground">{item.kind} from {item.sender}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={item.status === "accepted" ? "default" : "outline"}>
                                {item.status}
                              </Badge>
                              <time className="text-xs text-muted-foreground">
                                {new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </time>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ) : null}
                  {filteredNotificationGroups.map((group) => (
                    <section className="grid gap-3" key={group.label}>
                      <div className="flex items-center gap-3">
                        <h2 className="text-sm font-semibold text-muted-foreground">{group.label}</h2>
                        <Separator className="flex-1" />
                      </div>
                      <div className="grid gap-3">
                        {group.records.map((record) => renderNotificationCard(record))}
                      </div>
                    </section>
                  ))}
                  {filteredNotificationGroups.length === 0 ? (
                    <EmptyState>No pending notifications.</EmptyState>
                  ) : null}
                </div>
              </section>
            ) : null}
            </main>
          {renderProfileModal()}
          {renderProfileEditModal()}
          {renderContactsModal()}
          </SidebarInset>
        </SidebarProvider>
      )}
    </TooltipProvider>
  );

}

export default App;
