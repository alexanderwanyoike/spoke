// Live WebKitGTK regression check. Start Spoke with
// WEBKIT_INSPECTOR_HTTP_SERVER=127.0.0.1:9231, open a scrollable conversation,
// and keep its window visible. Requires Node with built-in WebSocket support.
// Scrolls the existing page and restores its position; never sends messages.
import assert from "node:assert/strict";

const inspector = process.env.SPOKE_INSPECTOR_URL || "http://127.0.0.1:9231";
const listing = await (await fetch(inspector)).text();
const socketPath = listing.match(/['"](\/socket\/[^'"]+)['"]/)?.[1];
assert.ok(socketPath, "Spoke must expose a remote WebKit inspector target");
const socket = new WebSocket(inspector.replace(/^http/, "ws") + socketPath);
const targets = [];
const pending = new Map();
const paints = [];
let sequence = 0;
const deadline = setTimeout(() => {
  console.error("Desktop paint check timed out");
  process.exit(1);
}, 90_000);

socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  if (message.method === "Target.targetCreated") targets.push(message.params.targetInfo);
  if (message.method !== "Target.dispatchMessageFromTarget") return;
  const inner = JSON.parse(message.params.message);
  if (pending.has(inner.id)) {
    pending.get(inner.id)(inner);
    pending.delete(inner.id);
  }
  if (inner.method === "Timeline.eventRecorded") collect(inner.params.record);
};

function collect(record) {
  if (record.type === "Paint") paints.push((record.endTime - record.startTime) * 1000);
  for (const child of record.children || []) collect(child);
}

async function call(targetId, method, params = {}) {
  const id = ++sequence;
  const response = new Promise((resolve) => pending.set(id, resolve));
  socket.send(JSON.stringify({
    id: ++sequence,
    method: "Target.sendMessageToTarget",
    params: { targetId, message: JSON.stringify({ id, method, params }) }
  }));
  const result = await response;
  assert.equal(result.error, undefined, `${method}: ${JSON.stringify(result.error)}`);
  return result.result;
}

await new Promise((resolve, reject) => {
  socket.onopen = resolve;
  socket.onerror = reject;
});
await new Promise((resolve) => setTimeout(resolve, 200));
const page = targets.find((target) => target.type === "page")?.targetId;
const frame = targets.find((target) => target.type === "frame")?.targetId || page;
assert.ok(page, "Expected a WebKit page target");

try {
  for (const method of ["Inspector.enable", "Page.enable", "Timeline.enable", "Inspector.initialized"])
    await call(page, method);
  const state = await call(frame, "Runtime.evaluate", {
    expression: "({ title: document.title, visible: !document.hidden, focused: document.hasFocus() })",
    returnByValue: true
  });
  assert.equal(state.result.value.title, "Spoke", "Only run this check against Spoke");
  assert.ok(state.result.value.visible && state.result.value.focused, "Bring Spoke to the foreground before running this check");
  const focus = await call(frame, "Runtime.evaluate", {
    expression: `(() => {
      const input = document.querySelector("textarea");
      if (!input) throw new Error("Open a message conversation before running this check");
      const previous = document.activeElement;
      input.focus({ preventScroll: true });
      const style = getComputedStyle(input);
      const visible = input.matches(":focus-visible") &&
        style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
      input.blur();
      previous?.focus({ preventScroll: true });
      return visible;
    })()`,
    returnByValue: true
  });
  assert.equal(focus.result.value, true, "The flat theme must retain a visible keyboard focus outline");
  await call(page, "Timeline.start", { maxCallStackDepth: 0 });
  const start = await call(frame, "Runtime.evaluate", {
    expression: `(() => {
      if (document.hidden)
        throw new Error("Spoke must be visible before running this check");
      if (document.scrollingElement.scrollHeight <= innerHeight + 64)
        throw new Error("Open a conversation long enough to scroll before running this check");
      const original = scrollY;
      let remaining = 24;
      window.__spokePaintCheck = { done: false, frames: [] };
      let last = performance.now();
      function step(now) {
        window.__spokePaintCheck.frames.push(now - last);
        last = now;
        scrollTo(0, remaining % 2 ? 64 : 0);
        if (--remaining) requestAnimationFrame(step);
        else {
          scrollTo(0, original);
          window.__spokePaintCheck.done = true;
        }
      }
      requestAnimationFrame(step);
      return { width: innerWidth, height: innerHeight, scale: devicePixelRatio };
    })()`,
    returnByValue: true
  });
  assert.equal(start.wasThrown, false, "The scroll workload must start");
  let result;
  do {
    await new Promise((resolve) => setTimeout(resolve, 500));
    result = await call(frame, "Runtime.evaluate", {
      expression: "window.__spokePaintCheck", returnByValue: true
    });
  } while (!result.result.value.done);
  await call(page, "Timeline.stop");
  const frames = result.result.value.frames.slice(1).sort((a, b) => a - b);
  paints.sort((a, b) => a - b);
  const summary = {
    viewport: start.result.value,
    paintCount: paints.length,
    paintTotalMs: paints.reduce((sum, value) => sum + value, 0),
    paintP95Ms: paints[Math.floor(paints.length * 0.95)],
    paintMaxMs: paints.at(-1),
    frameP95Ms: frames[Math.floor(frames.length * 0.95)]
  };
  console.log(JSON.stringify(summary, null, 2));
  assert.ok(paints.length >= 12, "Expected actual on-screen paints during scrolling");
  assert.ok(summary.paintTotalMs > 0, "Inspector timestamps must be initialized");
  assert.ok(summary.paintP95Ms < 50, "Scrolling must not repeatedly block painting for 50 ms or more");
} finally {
  await call(frame, "Runtime.evaluate", { expression: "delete window.__spokePaintCheck" });
  await call(page, "Timeline.disable");
  socket.close();
  clearTimeout(deadline);
}
