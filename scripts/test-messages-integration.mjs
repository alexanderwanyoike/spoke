import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const directory = await mkdtemp(join(tmpdir(), "spoke-integration-"));
const children = [];
const keep = process.argv.includes("--keep");
const binary = process.env.JOLT_BINARY || "jolt";

async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startNode(name, bootstrap) {
  const port = await freePort();
  const p2p = await freePort();
  const log = createWriteStream(join(directory, `${name}.log`));
  const args = [
    "start",
    "--api-port",
    String(port),
    "--transport",
    "tcp",
    "--p2p-port",
    String(p2p),
    "--no-mdns"
  ];
  if (bootstrap) args.push("--bootstrap", bootstrap);
  else args.push("--no-bootstrap");
  const child = spawn(binary, args, {
    env: {
      ...process.env,
      XDG_DATA_HOME: join(directory, name),
      XDG_CONFIG_HOME: join(directory, `${name}-config`)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  children.push(child);
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  let failure;
  child.on("error", (error) => {
    failure = error;
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (failure) throw failure;
    if (child.exitCode !== null) throw new Error(`${name} exited. See ${directory}/${name}.log`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/status`);
      if (response.ok)
        return {
          port,
          bootstrap: `/ip4/127.0.0.1/tcp/${p2p}/p2p/${(await response.json()).peer_id}`
        };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${name} did not start. See ${directory}/${name}.log`);
}

try {
  const alice = await startNode("alice");
  const bob = await startNode("bob", alice.bootstrap);
  await writeFile(
    join(directory, "nodes.json"),
    JSON.stringify({ alice: alice.port, bob: bob.port })
  );
  const test = spawn("yarn", ["test", "tests/integration/messages.test.ts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      SPOKE_INTEGRATION: "1",
      SPOKE_ALICE_PORT: String(alice.port),
      SPOKE_BOB_PORT: String(bob.port),
      SPOKE_INTEGRATION_DIR: directory
    }
  });
  process.exitCode = await new Promise((resolve) => test.on("exit", (code) => resolve(code ?? 1)));
  if (keep && process.exitCode === 0) {
    console.log(`Disposable review nodes: ${directory}`);
    console.log(`Alice: ${alice.port}; Bob: ${bob.port}. Stop this process to close them.`);
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
  }
} finally {
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (!child.pid || child.exitCode !== null) return resolve();
          child.once("exit", resolve);
          child.kill("SIGTERM");
        })
    )
  );
  if (process.exitCode === 0 && !keep) await rm(directory, { recursive: true, force: true });
  else console.log(`Integration artifacts: ${directory}`);
}
