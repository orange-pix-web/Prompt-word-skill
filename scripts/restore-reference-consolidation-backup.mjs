/* Restore files saved by consolidate-reference-assets.mjs without touching original images. */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

const DATA_ROOT = path.resolve(path.join(import.meta.dirname, "..", ".."));
const backupRelative = process.argv[2];
if (!backupRelative) throw new Error("请传入备份目录相对路径");
const backupRoot = path.resolve(DATA_ROOT, backupRelative);
if (!backupRoot.startsWith(DATA_ROOT) || !fsSync.existsSync(backupRoot)) throw new Error("备份目录不存在或不在项目根目录中");

async function walk(folder) {
  const files = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile()) files.push(target);
    }
  }
  await visit(folder);
  return files;
}

const files = await walk(backupRoot);
for (const source of files) {
  const relative = path.relative(backupRoot, source);
  const target = path.join(DATA_ROOT, relative);
  if (!target.startsWith(DATA_ROOT)) throw new Error("发现异常备份路径");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
}
console.log(JSON.stringify({ restored: files.length, backup: path.relative(DATA_ROOT, backupRoot).replaceAll("\\", "/") }, null, 2));
