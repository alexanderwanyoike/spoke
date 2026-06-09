# Spoke

Spoke is a small Jolt social PoC for known identities. It keeps social concepts in app-owned JSON objects under `/spoke/*`:

- `/spoke/profile` for the local display profile
- `/spoke/posts/{id}` for public posts
- `/spoke/feed` for the app-level feed index
- `/spoke/outgoing/{id}` for encrypted outbound reply envelopes
- `/spoke/replies/{id}` for accepted incoming replies

## Run

Spoke is desktop-first. Run Jolt Console first and let it start the local Jolt
daemon, then open Spoke and approve Spoke's app session in Console.

```sh
npm install
npm run desktop:dev
```

Build the Linux AppImage:

```sh
npm run desktop:build
```

The AppImage is written to:

```text
src-tauri/target/release/bundle/appimage/Spoke_0.1.0_amd64.AppImage
```

For web development:

```sh
npm run dev
```

The Vite dev server listens on `http://127.0.0.1:5178` and proxies the local daemon from `VITE_JOLT_DAEMON_URL` or `http://127.0.0.1:9862`.

## Local demo shape

1. Start a Jolt daemon and Jolt Console.
2. Open Spoke and request app access.
3. Approve the Spoke session in Console.
4. Publish a profile and a post.
5. Add a known contact by `.jolt` identity.
6. Refresh the feed and send an encrypted reply to a contact post.
7. On the recipient Spoke instance, refresh Incoming, open the ingress item, then accept or reject it.

The current reply flow uses existing daemon APIs only: Spoke encrypts and publishes an outgoing object under the sender's `/spoke/outgoing/*`, fetches the encrypted bytes by CID, then submits those bytes to the recipient daemon `/api/v1/ingress`.
