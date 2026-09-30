import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = process.env.PORT || "3000";

// 直接执行 wrangler 的 JS 入口，而不是 .bin 下的 wrangler.cmd。
// Windows 上 Node 不允许在不开 shell 的情况下启动 .cmd 文件（spawn EINVAL），
// 而开启 shell 又会引入一层命令解析。用当前 Node 进程执行入口文件可以避开这两件事。
const wranglerEntry = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

const child = spawn(process.execPath, [wranglerEntry, "dev", "--port", port], {
  stdio: "inherit",
});

child.once("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
