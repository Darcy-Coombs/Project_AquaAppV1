import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const root = process.cwd();
const nodePort = 19087;
const webPort = 15173;
const nodeUrl = `http://127.0.0.1:${nodePort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const servers = [];

function start(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32" && command.endsWith(".cmd"),
    ...options
  });
  servers.push(child);
  return child;
}

async function waitFor(url, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep polling until the server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function stopAll() {
  for (const child of servers) {
    if (!child.pid) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
}

try {
  const nodeEnv = { ...process.env, AQUA_NODE_PORT: String(nodePort), AQUA_NODE_DB: join(root, `.e2e-node-${nodePort}.sqlite`) };
  const webEnv = { ...process.env, VITE_AQUA_NODE_URL: nodeUrl };

  start("node", ["--loader", "./ts-loader.mjs", "src/server.ts"], {
    cwd: join(root, "packages/node"),
    env: nodeEnv
  });

  await waitFor(`${nodeUrl}/health`);

  const build = spawnSync(npx, ["vite", "build", "--mode", "development", "--configLoader", "runner"], {
    cwd: join(root, "packages/web"),
    env: webEnv,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (build.status !== 0) process.exit(build.status ?? 1);

  start(npx, ["vite", "preview", "--configLoader", "runner", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], {
    cwd: join(root, "packages/web"),
    env: webEnv
  });

  await waitFor(webUrl);

  const result = spawnSync(npx, ["playwright", "test", "tests/e2e", "--config", "playwright.config.ts"], {
    cwd: root,
    env: { ...process.env, AQUA_WEB_URL: webUrl },
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  process.exitCode = result.status ?? 1;
} finally {
  stopAll();
  process.exit(process.exitCode ?? 0);
}
