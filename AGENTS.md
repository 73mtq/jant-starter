This is a Jant site created with `create-jant`. The application is `@jant/core` in `node_modules`; this project holds its configuration and deployment. `CLAUDE.md` points here.

## Where to look

These come from the installed Jant version, so they stay current after an upgrade:

- **Content**: reading, publishing, editing, organizing, searching, and importing posts through the HTTP API or MCP. Fetch `/skill.md` from the running site, for example `https://www.feiyisc.top/skill.md`, or `http://localhost:<port>/skill.md` during `npm run dev`.
- **Command line**: `npx jant --help` lists the commands, and `npx jant <command> --help` lists a command's options.
- **Configuration, deployment, and theming**: https://jant.me/docs

## Project files

- `index.js` is the entry point. It calls `createApp()` from `@jant/core` and wraps it with three site-specific edge behaviors: redirecting non-canonical hosts and plain HTTP to `https://www.feiyisc.top`, adding `Disallow: /search` to robots.txt, and marking `/search` with `X-Robots-Tag: noindex`. Everything else passes straight through to Jant.
- `scripts/prepare-assets.mjs` builds `dist/public`, the Cloudflare static asset directory. It copies the hashed assets out of `@jant/core` and writes `_headers`, which gives them a one-year immutable browser cache. `@jant/core`'s own `dist/client` cannot hold `_headers`, and it carries a build-only `.vite` directory that must not be published.
- `scripts/deploy.mjs` runs the three deploy steps: prepare assets, apply remote migrations, upload the Worker.
- `scripts/jant.mjs` runs `jant` commands on Windows. `@jant/core`'s own `bin/jant.js` imports command modules by absolute path (`D:\...`), which Node's ESM loader rejects, so every command fails with `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
- `scripts/dev.mjs` starts `wrangler dev` through Wrangler's JS entry point. Spawning `.bin/wrangler.cmd` fails on Windows with `spawn EINVAL`.
- `wrangler.toml` is the Cloudflare deployment and binding config. `[assets] directory` points at `dist/public`.
- `.dev.vars` holds local secrets such as `AUTH_SECRET`.
- `examples/agent-content-automation/` has sample API requests.

## Rules

- Don't edit `node_modules/@jant/core`. Changes to the product belong in the Jant repository.
- Customize through site settings, custom CSS, and theme variables. Keep `index.js` to edge concerns that no Jant setting covers.
- Deploy with `npm run deploy`, not `wrangler deploy`: it prepares `dist/public`, applies remote migrations, and then deploys.
- Run `jant` commands from this directory, where `@jant/core` is installed.
