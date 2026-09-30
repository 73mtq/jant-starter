import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 站点根目录，即本文件所在目录的上一级
const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const sourceAssets = resolve(
  siteRoot,
  "node_modules/@jant/core/dist/client/_assets",
);
const publishDir = resolve(siteRoot, "dist/public");
const publishAssets = resolve(publishDir, "_assets");

// 资源文件名带内容哈希（例如 client-DRuw7XCt.css），内容不会变化，
// 浏览器可以长期缓存，不必每次回源验证。
const HEADERS = `/_assets/*
  Cache-Control: public, max-age=31536000, immutable
`;

if (!existsSync(sourceAssets)) {
  throw new Error(
    `找不到 @jant/core 的构建资源：${sourceAssets}。请先运行 npm install。`,
  );
}

// 每次全量重建，避免上一版本的哈希文件残留。
await rm(publishDir, { recursive: true, force: true });
await mkdir(publishAssets, { recursive: true });

// 只复制 _assets。dist/client 下除此之外只有构建期的 .vite 目录，
// 它不应出现在发布目录里。
await cp(sourceAssets, publishAssets, { recursive: true });
await writeFile(resolve(publishDir, "_headers"), HEADERS);

console.log(`已准备发布资源：${publishDir}`);
