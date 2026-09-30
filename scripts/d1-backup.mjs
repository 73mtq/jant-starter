import { spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 用 `wrangler d1 execute --remote --json` 逐表导出一份 SQL 备份。
 *
 * `wrangler d1 export` 拒绝 FTS5 虚拟表存在的数据库，`jant db export` 又会执行
 * `PRAGMA table_xinfo`，而 D1 的远端接口对它返回 SQLITE_AUTH。两条路都用不了，
 * 所以这里直接读表数据并生成 INSERT 语句。
 */

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerEntry = join(
  siteRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

const [outputPath] = process.argv.slice(2);
if (!outputPath) {
  throw new Error("用法：node scripts/d1-backup.mjs <输出文件路径>");
}

function queryJson(sql) {
  const result = spawnSync(
    process.execPath,
    [wranglerEntry, "d1", "execute", "DB", "--remote", "--json", "--command", sql],
    { cwd: siteRoot, encoding: "utf-8", maxBuffer: 512 * 1024 * 1024 },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `查询失败（退出码 ${result.status}）：\n${result.stdout}\n${result.stderr}`,
    );
  }

  // Wrangler 会在 JSON 之前打印提示行，从第一个 [ 或 { 开始解析。
  const raw = result.stdout;
  const bracket = raw.search(/[[{]/);
  if (bracket === -1) {
    throw new Error(`没有从输出里找到 JSON：\n${raw}`);
  }
  const parsed = JSON.parse(raw.slice(bracket));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`JSON 结构不是预期的一批结果集：\n${raw}`);
  }
  // 多个语句时逐条合并结果。
  return parsed.flatMap((entry) => {
    if (entry.success !== true) {
      throw new Error(`语句执行失败：${JSON.stringify(entry)}`);
    }
    return entry.results ?? [];
  });
}

function quoteSqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`数值无法写进 SQL：${value}`);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "string") {
    return `'${value.replaceAll("'", "''")}'`;
  }
  throw new Error(`不认识的字段类型 ${typeof value}：${JSON.stringify(value)}`);
}

const tables = queryJson(
  `SELECT name, sql FROM sqlite_master
   WHERE type = 'table'
     AND name NOT LIKE 'sqlite_%'
     AND name NOT LIKE '_cf_%'
     AND name NOT LIKE 'post_fts%'
   ORDER BY name`,
).map((row) => ({ name: String(row.name), createSql: row.sql }));

if (tables.length === 0) {
  throw new Error("没有读到任何表，终止备份。");
}

const indexes = queryJson(
  `SELECT name, sql FROM sqlite_master
   WHERE type = 'index'
     AND name NOT LIKE 'sqlite_%'
     AND name NOT LIKE 'post_fts%'
     AND sql IS NOT NULL
   ORDER BY name`,
).map((row) => String(row.sql));

const triggers = queryJson(
  `SELECT name, sql FROM sqlite_master
   WHERE type = 'trigger'
     AND name NOT LIKE 'post_fts%'
     AND sql IS NOT NULL
   ORDER BY name`,
).map((row) => String(row.sql));

mkdirSync(dirname(outputPath), { recursive: true });
const out = createWriteStream(outputPath, { encoding: "utf-8" });

function write(line) {
  out.write(`${line}\n`);
}

write("-- 由 scripts/d1-backup.mjs 从远端 D1 导出。");
write(`-- 导出时间：${new Date().toISOString()}`);
write("PRAGMA foreign_keys=OFF;");
write("BEGIN TRANSACTION;");
write("");

let totalRows = 0;
const summary = [];

for (const table of tables) {
  write(`-- ${table.name}`);
  write(`DROP TABLE IF EXISTS ${JSON.stringify(table.name)};`);
  write(`${table.createSql};`);

  const rows = queryJson(`SELECT * FROM ${JSON.stringify(table.name)}`);
  summary.push(`${table.name}=${rows.length}`);
  totalRows += rows.length;

  if (rows.length > 0) {
    const columns = Object.keys(rows[0]);
    const columnList = columns.map((c) => JSON.stringify(c)).join(", ");
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const values = chunk
        .map(
          (row) =>
            `(${columns.map((c) => quoteSqlValue(row[c])).join(", ")})`,
        )
        .join(",\n  ");
      write(`INSERT INTO ${JSON.stringify(table.name)} (${columnList}) VALUES\n  ${values};`);
    }
  }
  write("");
}

write("-- 索引");
for (const sql of indexes) write(`${sql};`);
write("");
write("-- 触发器");
for (const sql of triggers) write(`${sql};`);
write("");
write("COMMIT;");

await new Promise((resolve, reject) => {
  out.end((error) => (error ? reject(error) : resolve()));
});

console.log(`已导出 ${tables.length} 张表、${totalRows} 行到 ${outputPath}`);
console.log(summary.join("  "));
