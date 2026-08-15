import { networkInterfaces } from "node:os";
import { spawn, spawnSync } from "node:child_process";

const nodePort = 8787;
const webPort = 5173;
const host = firstLanAddress();
const nodeUrl = `http://${host}:${nodePort}`;
const webUrl = `http://${host}:${webPort}`;
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const children = [];

if (!host) {
  console.error("Could not find a LAN IPv4 address. Connect this computer to Wi-Fi/LAN and try again.");
  process.exit(1);
}

console.log("");
console.log("Project Aqua Fieldkit v1.0.2 phone test");
console.log("=======================");
console.log("");
console.log(`Phone URL: ${webUrl}`);
console.log(`Node URL:  ${nodeUrl}`);
console.log("");
console.log("Use a phone on the same Wi-Fi network.");
console.log("For true install/download as a PWA, use an HTTPS host such as GitHub Codespaces after pushing.");
console.log("");

const env = {
  ...process.env,
  AQUA_NODE_HOST: "0.0.0.0",
  AQUA_NODE_PORT: String(nodePort),
  VITE_AQUA_NODE_URL: nodeUrl
};

start("node", ["--loader", "./ts-loader.mjs", "src/server.ts"], { cwd: "packages/node", env });

const build = spawnSync(npx, ["vite", "build", "--mode", "development", "--configLoader", "runner"], {
  cwd: "packages/web",
  env,
  stdio: "inherit",
  shell: process.platform === "win32"
});
if (build.status !== 0) {
  stop();
  process.exit(build.status ?? 1);
}

start(npx, ["vite", "preview", "--configLoader", "runner", "--host", "0.0.0.0", "--port", String(webPort), "--strictPort"], {
  cwd: "packages/web",
  env,
  shell: process.platform === "win32"
});

if (process.platform === "win32") {
  spawn("cmd.exe", ["/c", "start", "", webUrl], { detached: true, stdio: "ignore" }).unref();
}

process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});

function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  children.push(child);
  return child;
}

function stop() {
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
}

function firstLanAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "";
}
