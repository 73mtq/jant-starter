import { createApp } from "@jant/core";

/**
 * 站点边缘处理。
 *
 * 这里只做三件 @jant/core 不提供的、属于本站的事：
 *   1. 把非规范主机名与明文 HTTP 的请求 301 到规范地址；
 *   2. 在 robots.txt 里加上 Disallow: /search；
 *   3. 给搜索结果页加 X-Robots-Tag: noindex。
 *
 * 其余请求原样交给 Jant。cloudflare 的 _headers 规则只作用于静态资源响应，
 * Worker 生成的响应拿不到它们，所以这两条头部规则写在这里。
 */

// 与 wrangler.toml 的 SITE_ORIGIN 保持一致。
const CANONICAL_ORIGIN = "https://www.feiyisc.top";
const CANONICAL_HOST = new URL(CANONICAL_ORIGIN).hostname;

// 本地开发地址不参与跳转。
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

const app = createApp();

function isLocalHost(hostname) {
  return (
    LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".localtest.me")
  );
}

/**
 * 客户端是否用明文 HTTP 访问。Cloudflare 会注入 cf-visitor 说明原始协议，
 * 它比 request.url 更可靠。
 */
function isPlainHttp(request, url) {
  if (url.protocol !== "https:") return true;

  const visitor = request.headers.get("cf-visitor");
  if (!visitor) return false;

  try {
    return JSON.parse(visitor).scheme === "http";
  } catch {
    throw new Error(`cf-visitor 头不是合法 JSON：${visitor}`);
  }
}

function redirectToCanonical(url) {
  const target = new URL(url.pathname + url.search, CANONICAL_ORIGIN);
  return new Response(null, {
    status: 301,
    headers: { Location: target.toString() },
  });
}

/**
 * 在 robots.txt 的规则组末尾插入一条 Disallow。
 * 搜索结果页没有值得收录的内容。
 *
 * 空行在 robots.txt 里表示规则组结束，因此插入位置要落在空行之前，
 * 否则后面的解析器会认为这条规则没有对应的 User-agent 而忽略它。
 */
async function withSearchDisallow(response) {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!response.ok || !contentType.startsWith("text/plain")) {
    throw new Error(
      `robots.txt 响应的形状与预期不符：status=${response.status} Content-Type=${contentType}`,
    );
  }

  const lines = (await response.text()).split("\n");
  const sitemapIndex = lines.findIndex((line) => line.startsWith("Sitemap:"));
  if (sitemapIndex === -1) {
    throw new Error("robots.txt 响应里没有 Sitemap 行，无法确定插入位置。");
  }

  let insertAt = sitemapIndex;
  while (insertAt > 0 && lines[insertAt - 1].trim() === "") {
    insertAt -= 1;
  }
  lines.splice(insertAt, 0, "Disallow: /search");

  return new Response(lines.join("\n"), {
    status: 200,
    headers: new Headers(response.headers),
  });
}

function withSearchNoindex(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (
      !isLocalHost(url.hostname) &&
      (url.hostname !== CANONICAL_HOST || isPlainHttp(request, url))
    ) {
      return redirectToCanonical(url);
    }

    const response = await app.fetch(request, env, ctx);

    if (url.pathname === "/robots.txt") {
      return withSearchDisallow(response);
    }

    if (url.pathname === "/search") {
      return withSearchNoindex(response);
    }

    return response;
  },
};
