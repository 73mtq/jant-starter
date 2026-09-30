import { readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * 在 Windows 上运行 jant 命令。
 *
 * @jant/core 的 bin/jant.js 用 `import(join(commandsDir, "..."))` 载入命令模块，
 * 在 Windows 上它得到的是 `D:\...` 这样的绝对路径，而 Node 的 ESM 载入器只接受
 * file:、data:、node: 三种协议，于是任何命令都会以
 * ERR_UNSUPPORTED_ESM_URL_SCHEME 失败。这里用 pathToFileURL 转换后再载入。
 *
 * 命令发现、最长前缀匹配、参数切分与帮助文本都沿用 @jant/core 自己的数据与
 * 实现，执行的是它自带的命令模块，不是另写一套命令。
 *
 * 该包的 exports 只暴露根路径与 ./i18n，所以内部文件一律用文件 URL 载入。
 */

const coreRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  "@jant",
  "core",
);

const commandModulesDir = join(coreRoot, "bin", "commands");

const { PUBLIC_COMMAND_GROUPS } = await import(
  pathToFileURL(join(coreRoot, "bin", "lib", "command-registry.js")).href
);

async function listCommands() {
  const commands = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".js")) {
        continue;
      }
      const commandPath = relative(commandModulesDir, fullPath)
        .replace(/\\/g, "/")
        .replace(/\.js$/, "");
      commands.push(commandPath.split("/"));
    }
  }

  await walk(commandModulesDir);
  return commands;
}

/** 从 argv[start] 起，匹配已知命令里最长的一条，例如 ["site", "export"]。 */
function matchCommand(argv, commands, start) {
  const positionalTail = [];
  for (let i = start; i < argv.length; i += 1) {
    if (argv[i].startsWith("-")) break;
    positionalTail.push(argv[i]);
  }

  for (let length = positionalTail.length; length >= 1; length -= 1) {
    const candidate = positionalTail.slice(0, length);
    if (
      commands.some(
        (segments) =>
          segments.length === candidate.length &&
          segments.every((segment, idx) => segment === candidate[idx]),
      )
    ) {
      return candidate;
    }
  }
  return null;
}

function showHelp() {
  const width = Math.max(
    ...PUBLIC_COMMAND_GROUPS.flatMap((group) =>
      group.commands.map((command) => command.name.length),
    ),
  );

  console.log("Usage: jant <command> [options]");
  for (const group of PUBLIC_COMMAND_GROUPS) {
    console.log("");
    console.log(`${group.title}:`);
    for (const command of group.commands) {
      console.log(`  ${command.name.padEnd(width)}  ${command.summary}`);
    }
  }
  console.log("");
  console.log("Run 'jant <command> --help' for command-specific help.");
}

const argv = process.argv.slice(2);
const commandStart = argv.findIndex((arg) => !arg.startsWith("-"));

if (commandStart === -1) {
  showHelp();
  process.exit(0);
}

const commands = await listCommands();

// 命令只读取写在它后面的选项。写在前面的一律报错，与上游行为一致：
// 否则 `jant --remote migrate` 会去迁移本地数据库。
if (commandStart > 0) {
  const named = argv.findIndex((_, index) =>
    matchCommand(argv, commands, index),
  );
  const nameIndex = named === -1 ? commandStart : named;
  const name = (
    matchCommand(argv, commands, nameIndex) ?? [argv[nameIndex]]
  ).join(" ");
  const leading = argv.slice(0, nameIndex).join(" ");
  console.error(
    `Options go after the command: jant <command> [options]. Move "${leading}" after "${name}".`,
  );
  process.exit(1);
}

const matched = matchCommand(argv, commands, commandStart);
if (!matched) {
  console.error(`Unknown command: ${argv[commandStart]}`);
  console.error("");
  showHelp();
  process.exit(1);
}

const commandIndex = commandStart + matched.length - 1;
const commandPath = `${join(commandModulesDir, ...matched)}.js`;
const mod = await import(pathToFileURL(commandPath).href);
await mod.run(argv.slice(commandIndex + 1));
