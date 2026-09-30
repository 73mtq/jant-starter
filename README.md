# Jant Site

A personal website/blog powered by [Jant](https://github.com/jant-me/jant), published at `https://www.feiyisc.top`.

Examples below use `npm`, but the same scripts work with `pnpm run` or `yarn`.

## Option A: One-Click Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/jant-me/jant-starter)

Deploy to Cloudflare instantly, without local setup.

In this flow, Cloudflare creates the new GitHub repo, D1 database, and R2 bucket for you from the form.

### Deploy form fields

| Field                      | What to do                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Git account**            | Select your GitHub account. Cloudflare creates a new repo for you.                                                        |
| **D1 database**            | Keep **Create new**. The default name is fine.                                                                            |
| **Database location hint** | Pick a nearby region if you want. Leaving it alone is fine too.                                                           |
| **R2 bucket**              | Keep **Create new**. The default name is fine.                                                                            |
| **AUTH_SECRET**            | Keep the generated value, or replace it with your own 32+ character secret.                                               |
| **SITE_ORIGIN**            | Optional. Set this when you want a fixed public origin such as `https://my-blog.example.com`.                             |
| **SITE_PATH_PREFIX**       | Optional. Set this only when you mount the site under a subpath such as `/blog`. Leave it empty for a normal root deploy. |

### After deploy

1. Open the site URL shown in Cloudflare, usually `https://<project>.<account>.workers.dev`
2. Go through the setup flow and create your admin account
3. If you set `SITE_ORIGIN` to a custom domain, add that domain in Cloudflare under **Workers & Pages**
4. If you leave `SITE_ORIGIN` empty, Jant uses the current request host automatically

### Develop locally

Cloudflare creates a GitHub repo for you during one-click deploy. To keep working locally:

```bash
git clone git@github.com:<your-username>/<your-repo>.git
cd <your-repo>
npm install
npm run dev
```

Open `http://localhost:3000`. Changes pushed to `main` will auto-deploy.

Need another local port? Run:

```bash
PORT=3030 npm run dev
```

## Option B: Manual Deploy from Your Machine

If you would rather create or keep a local site repo and deploy it yourself, use the steps below.

### 1. Log In to Wrangler

```bash
npx wrangler login
```

### 2. Create the D1 Database

```bash
npx wrangler d1 create <your-project>-db
```

Copy the `database_id` from the output into `wrangler.toml`.

### 3. Create the R2 Bucket

```bash
npx wrangler r2 bucket create <your-project>-media
```

Make sure `wrangler.toml` uses the same bucket name.

### 4. Set the Production Auth Secret

```bash
openssl rand -base64 32
npx wrangler secret put AUTH_SECRET
```

This is separate from the local secret in `.dev.vars`.

### 5. Deploy

```bash
npm run deploy
```

After deploy, Cloudflare gives you a `*.workers.dev` URL.

## Local Development

Start the local dev server:

```bash
npm run dev
```

This prepares `dist/public`, applies pending migrations to the local D1, then starts Wrangler dev. Open `http://localhost:3000`.

## Static Assets

`scripts/prepare-assets.mjs` builds `dist/public`, the directory `wrangler.toml` hands to Cloudflare as `[assets]`. It copies the hashed client assets out of `@jant/core` and writes a `_headers` file that gives them `Cache-Control: public, max-age=31536000, immutable`. Asset filenames carry a content hash, so their contents never change and browsers can keep them for a year.

Two things make this directory necessary rather than pointing `[assets]` straight at `node_modules/@jant/core/dist/client`:

- `_headers` has to sit beside the assets it applies to, and `node_modules` cannot hold it.
- `dist/client` also contains a build-only `.vite/` directory. Serving it would publish the client build manifest, which lists internal source paths.

Both `npm run dev` and `npm run deploy` run the script first, so the directory is always current.

## Edge Behavior

`index.js` wraps `createApp()` with three site-specific behaviors, all of them things Jant has no setting for:

- Requests whose host is not `www.feiyisc.top`, and plain-HTTP requests, get a `301` to the canonical `https://www.feiyisc.top` address with the path and query preserved. The bare domain `feiyisc.top` is routed to the Worker by the `[[routes]]` entry in `wrangler.toml` for exactly this.
- `robots.txt` gains `Disallow: /search`.
- The `/search` page answers with `X-Robots-Tag: noindex`.

Everything else passes through untouched.

## Windows Scripts

`@jant/core`'s `bin/jant.js` and its `deploy` command both spawn executables in ways Windows rejects, so this project runs those steps through small wrappers:

- `scripts/jant.mjs` runs any `jant` command. The bundled `bin/jant.js` loads command modules by absolute path (`D:\...`), which Node's ESM loader refuses with `ERR_UNSUPPORTED_ESM_URL_SCHEME`, so every command fails before it does anything. The wrapper loads the same command modules through `pathToFileURL`.
- `scripts/deploy.mjs` runs `npm run deploy`. `jant deploy` calls `spawnSync("wrangler.cmd", ...)`, which fails with `spawn EINVAL`. The wrapper runs migrations through `jant migrate --remote` and uploads with Wrangler's JS entry point, which is what `jant deploy` would have run.
- `scripts/dev.mjs` starts the dev server the same way, because `.bin/wrangler.cmd` hits the identical `spawn EINVAL`.

Use `npx jant ...` on macOS and Linux as usual; these wrappers are what `npm run` uses on every platform.

## Common Commands

| Command                                                                                | Description                           |
| -------------------------------------------------------------------------------------- | ------------------------------------- |
| `npm run dev`                                                                          | Start local development               |
| `npm run deploy`                                                                       | Prepare assets, apply remote migrations, deploy |
| `npm run reset-password`                                                               | Generate a password reset token       |
| `npm run export`                                                                       | Dump the database to `jant-export.sql` |
| `node scripts/jant.mjs <command>`                                                      | Run any other jant command            |
| `npx jant site export --url https://your-site.example --output ./jant-site-export.zip` | Export the site as a portable archive |

## Upgrade

Check the [release notes](https://github.com/jant-me/jant/releases) for breaking changes, then:

```bash
npm install @jant/core@latest
npm run dev      # verify locally; applies new migrations to your local D1
npm run deploy   # deploy to Cloudflare; applies remote migrations
```

Back up the remote database before upgrading. `npx wrangler d1 export DB --remote --output backups/before-upgrade.sql` writes a portable SQL dump, and `npx wrangler d1 time-travel info DB --remote` prints the point-in-time bookmarks a restore would need.

If you used one-click deploy, you can also commit the updated `package.json` and lockfile and push to `main`, and the bundled GitHub Actions workflow rebuilds and applies remote migrations. That workflow needs `CF_API_TOKEN` and `CF_ACCOUNT_ID` repository secrets, and a Cloudflare API token with Workers Scripts, D1, R2, Workers Routes, and Zone Read permissions. It skips the deploy and says so in the run summary when those secrets are absent, and it fails if the live site does not answer afterwards.

## Configuration

The most common values live in two files:

- `.dev.vars` for local secrets
- `wrangler.toml` for non-sensitive Cloudflare configuration

This site sets these in `wrangler.toml`:

```toml
[vars]
SITE_ORIGIN = "https://www.feiyisc.top"
MAIN_RSS_FEED = "latest"
```

`MAIN_RSS_FEED = "latest"` makes `/feed` serve the Latest timeline instead of Featured. A value stored from the Settings page takes priority over this one.

Useful examples:

```toml
[vars]
SITE_ORIGIN = "https://yourdomain.com"
# SITE_PATH_PREFIX = "/blog"
# R2_PUBLIC_URL = "https://media.yourdomain.com"
# IMAGE_TRANSFORM_URL = "https://media.yourdomain.com/cdn-cgi/image"
```

## Documentation

Start here:

- [Introduction](https://jant.me/docs)
- [Deploy on Cloudflare](https://jant.me/docs/deployment)
- [Configuration](https://jant.me/docs/configuration)

For writing and customization:

- [Writing and Organizing Posts](https://jant.me/docs/writing-and-organizing)
- [Theming](https://jant.me/docs/theming)

For operations:

- [Export and Import](https://jant.me/docs/export-and-import)
- [Backups and Recovery](https://jant.me/docs/backups)

Reference:

- [API Reference](https://jant.me/docs/api)
- [GitHub Repository](https://github.com/jant-me/jant)

## AI Coding Tools

`AGENTS.md` tells a coding agent where to read about this site: the running site's `/skill.md` for content work through the API or MCP, `npx jant --help` for the command line, and the Jant docs for the rest. All three follow the installed Jant version. `CLAUDE.md` points to `AGENTS.md`.

For content automation examples, see `examples/agent-content-automation/README.md`.
