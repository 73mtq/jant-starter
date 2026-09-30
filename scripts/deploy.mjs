import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 部署到 Cloudflare，步骤与 `jant deploy` 相同：
 *   1. 准备 dist/public（含 _headers）；
 *   2. 对远端 D1 执行迁移与数据回填；
 *   3. 上传 Worker 与该静态资源目录。
 *
 * `jant deploy` 在 Windows 上无法运行：它用 spawnSync 启动 `wrangler.cmd`，
 * Node 不允许在没有 shell 的情况下启动 .cmd 文件（spawn EINVAL）。
 * 这里改用当前 Node 进程执行 wrangler 的 JS 入口，迁移与部署仍是 @jant/core
 * 与 wrangler 自带命令，没有另写实现。
 */

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const jant = join(siteRoot, "scripts", "jant.mjs");
const wranglerEntry = join(
  siteRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: siteRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`进程被信号终止：${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`命令以退出码 ${code} 结束：node ${args.join(" ")}`));
        return;
      }
      resolve();
    });
  });
}

const assetsDir = join(siteRoot, "dist", "public");

await run([join(siteRoot, "scripts", "prepare-assets.mjs")]);

console.log("Running remote migrations...");
await run([jant, "migrate", "--remote"]);

console.log(`Deploying with assets from ${assetsDir}...`);
await run([wranglerEntry, "deploy", "--assets", assetsDir]);
