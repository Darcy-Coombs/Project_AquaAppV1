import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npm, ["run", "dev", "-w", "@aqua/node"], { stdio: "inherit", shell: process.platform === "win32" }),
  spawn(npm, ["run", "dev", "-w", "@aqua/web"], { stdio: "inherit", shell: process.platform === "win32" })
];

const stop = () => {
  for (const child of children) child.kill();
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
