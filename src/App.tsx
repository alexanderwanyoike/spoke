import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Inbox,
  KeyRound,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  UserPlus,
  X
} from "lucide-react";
import {
  acceptIngress,
  apiErrorMessage,
  decodeFetchData,
  decodePlaintext,
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
  submitReplyThroughIngress,
  type AppSessionStatus,
  type IngressRecord,
  type NodeStatus,
  type PublishedContent,
  type SpokeFeedIndex,
  type SpokePost,
  type SpokeProfile,
  type SpokeReply
} from "./api";

type StoredSession = {
  requestId: string;
  token?: string | null;
  identity?: string | null;
  status: AppSessionStatus;
};

type Contact = {
  identity: string;
  displayName: string;
  receiverUrl: string;
};

type FeedItem = {
  source: "local" | "contact";
  contact?: Contact;
  post: SpokePost;
  address: string;
};

type ReviewState = {
  [ingressId: string]: {
    loading: boolean;
    opened?: SpokeReply;
    error?: string;
  };
};

const SESSION_KEY = "spoke.session";
const CONTACTS_KEY = "spoke.contacts";
const PROFILE_KEY = "spoke.profile";

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

function sortFeed(items: FeedItem[]) {
  return [...items].sort((a, b) => b.post.createdAt.localeCompare(a.post.createdAt));
}

function displayIdentity(identity?: string | null) {
  return identity || "No identity";
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
    displayName: "",
    receiverUrl: "http://127.0.0.1:9862"
  });
  const [postDraft, setPostDraft] = useState({ title: "", body: "" });
  const [feedIndex, setFeedIndex] = useState<SpokeFeedIndex | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [published, setPublished] = useState<PublishedContent[]>([]);
  const [incoming, setIncoming] = useState<IngressRecord[]>([]);
  const [review, setReview] = useState<ReviewState>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const sessionToken = session.token || "";
  const localIdentity = session.identity || status?.identity_address || "";
  const canUseApp = Boolean(sessionToken && session.status === "active");

  const localPosts = useMemo(
    () => feed.filter((item) => item.source === "local").length,
    [feed]
  );

  useEffect(() => {
    getStatus()
      .then(setStatus)
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  useEffect(() => {
    saveJson(CONTACTS_KEY, contacts);
  }, [contacts]);

  useEffect(() => {
    saveJson(PROFILE_KEY, profileDraft);
  }, [profileDraft]);

  useEffect(() => {
    saveJson(SESSION_KEY, session);
  }, [session]);

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
      const current = await getCurrentSession(sessionToken);
      setSession({
        requestId: current.request_id,
        token: sessionToken,
        identity: current.identity,
        status: current.status
      });
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

  async function loadLocalFeed() {
    let index: SpokeFeedIndex | null = null;
    try {
      const result = await fetchTarget(sessionToken, `${localIdentity}/spoke/feed`);
      index = JSON.parse(decodeFetchData(result)) as SpokeFeedIndex;
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
      setPostDraft({ title: "", body: "" });
      setNotice("Post published and local feed index updated.");
      await refreshFeed();
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
      receiverUrl: contactDraft.receiverUrl.trim() || "http://127.0.0.1:9862"
    };
    setContacts((current) => [
      nextContact,
      ...current.filter((contact) => contact.identity !== identity)
    ]);
    setContactDraft({
      identity: "",
      displayName: "",
      receiverUrl: "http://127.0.0.1:9862"
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

  async function refreshFeed() {
    await withBusy("feed", async () => {
      const nextItems: FeedItem[] = [];
      const nextPublished = await listPublished(sessionToken);
      setPublished(nextPublished.filter((item) => item.path?.startsWith("/spoke/")));

      const localIndex = await loadLocalFeed();
      for (const item of localIndex?.posts || []) {
        try {
          const post = await fetchPost(item.address || item.path, localIdentity);
          nextItems.push({
            source: "local",
            post,
            address: item.address || `${localIdentity}${item.path}`
          });
        } catch {
          // A stale feed entry should not block the rest of the timeline.
        }
      }

      for (const contact of contacts) {
        try {
          const index = await fetchIndex(contact.identity);
          for (const item of index.posts) {
            try {
              const post = await fetchPost(item.address || item.path, contact.identity);
              nextItems.push({
                source: "contact",
                contact,
                post,
                address: item.address || `${contact.identity}${item.path}`
              });
            } catch {
              // Keep loading the rest of this contact's posts.
            }
          }
        } catch {
          // Contacts can be offline or unknown.
        }
      }

      setFeed(sortFeed(nextItems));
      setNotice("Feed refreshed.");
    });
  }

  async function sendReply(item: FeedItem) {
    const body = (replyDrafts[item.address] || "").trim();
    if (!body) {
      setError("Reply body is required.");
      return;
    }
    if (!item.contact?.receiverUrl) {
      setError("Replies need a contact receiver URL.");
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
      await submitReplyThroughIngress(
        sessionToken,
        item.contact!.receiverUrl,
        item.contact!.identity,
        reply
      );
      setReplyDrafts((current) => ({ ...current, [item.address]: "" }));
      setNotice("Encrypted reply submitted to recipient ingress.");
    });
  }

  async function refreshIncoming() {
    await withBusy("incoming", async () => {
      setIncoming(await listPendingIngress(sessionToken));
      setNotice("Incoming requests refreshed.");
    });
  }

  async function openIncoming(record: IngressRecord) {
    setReview((current) => ({
      ...current,
      [record.ingress_id]: { loading: true }
    }));
    try {
      const opened = await openIngress(sessionToken, record.ingress_id);
      const reply = parseJsonBytes<SpokeReply>(opened.plaintext);
      setReview((current) => ({
        ...current,
        [record.ingress_id]: { loading: false, opened: reply }
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
      const opened = review[record.ingress_id]?.opened || parseJsonBytes<SpokeReply>(
        (await openIngress(sessionToken, record.ingress_id)).plaintext
      );
      await acceptIngress(sessionToken, record.ingress_id);
      await publishJson(sessionToken, makeReplyPath(opened.id), opened);
      setIncoming((current) => current.filter((item) => item.ingress_id !== record.ingress_id));
      setNotice("Reply accepted and published under /spoke/replies.");
    });
  }

  async function rejectIncoming(record: IngressRecord) {
    await withBusy(`reject:${record.ingress_id}`, async () => {
      await rejectIngress(sessionToken, record.ingress_id);
      setIncoming((current) => current.filter((item) => item.ingress_id !== record.ingress_id));
      setNotice("Incoming object rejected.");
    });
  }

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
                  <UserPlus size={16} />
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
                Receiver URL
                <input
                  value={contactDraft.receiverUrl}
                  onChange={(event) =>
                    setContactDraft((current) => ({ ...current, receiverUrl: event.target.value }))
                  }
                  placeholder="http://127.0.0.1:9864"
                />
              </label>
              <div className="contact-list">
                {contacts.map((contact) => (
                  <div className="contact-row" key={contact.identity}>
                    <div>
                      <strong>{contact.displayName}</strong>
                      <span>{contact.identity}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setContacts((current) =>
                          current.filter((item) => item.identity !== contact.identity)
                        )
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
                <p>{localPosts} local posts, {contacts.length} contacts</p>
              </div>
              <button type="button" onClick={refreshFeed} disabled={busy === "feed"} title="Refresh feed">
                <RefreshCw size={16} />
              </button>
            </section>

            <div className="feed-list">
              {feed.map((item) => (
                <article className="post-card" key={`${item.source}:${item.address}`}>
                  <header>
                    <div>
                      <strong>{item.post.displayName || item.post.author}</strong>
                      <span>{item.post.author}</span>
                    </div>
                    <time>{new Date(item.post.createdAt).toLocaleString()}</time>
                  </header>
                  <h3>{item.post.title}</h3>
                  <p>{item.post.body}</p>
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
                        placeholder={`Reply to ${item.contact?.displayName || item.post.author}`}
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
                          <span>{record.schema_hint || "encrypted object"}</span>
                        </div>
                        <div className="decision-buttons">
                          <button type="button" onClick={() => acceptIncoming(record)} title="Accept">
                            <Check size={14} />
                          </button>
                          <button type="button" onClick={() => rejectIncoming(record)} title="Reject">
                            <X size={14} />
                          </button>
                        </div>
                      </header>
                      {opened ? (
                        <div className="opened-reply">
                          <span>{opened.postAddress}</span>
                          <p>{opened.body}</p>
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

            <section className="panel">
              <div className="panel-heading">
                <h2>Local Objects</h2>
                <button type="button" onClick={refreshFeed} title="Refresh objects">
                  <RefreshCw size={16} />
                </button>
              </div>
              <div className="object-list">
                {published.map((item) => (
                  <div key={`${item.path}:${item.content_id}`}>
                    <strong>{item.path}</strong>
                    <span>{item.content_id.slice(0, 18)}</span>
                  </div>
                ))}
                {published.length === 0 ? <div className="empty-state compact">No `/spoke/*` objects loaded.</div> : null}
              </div>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}

export default App;
