import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARKETING_COPY_GROUPS,
  classifyMarketingGroup,
  parseProductMarketing,
  serializeProductMarketing,
} from "../lib/core.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(scriptDir, "..", "..");
const source = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(dataRoot, "营销文案", "产品营销词配置.md");
const backupDir = path.join(dataRoot, ".prompt-ui", "backups");
const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
const backup = path.join(backupDir, `产品营销词配置-分组迁移前-${timestamp}.md`);

const original = await fs.readFile(source, "utf8");
const entries = parseProductMarketing(original);
for (const entry of entries) entry.group = classifyMarketingGroup(entry);
await fs.mkdir(backupDir, { recursive: true });
await fs.copyFile(source, backup);
await fs.writeFile(source, serializeProductMarketing(entries), "utf8");

const counts = Object.fromEntries(MARKETING_COPY_GROUPS.map((group) => [
  group,
  entries.filter((entry) => entry.group === group).length,
]));
console.log(JSON.stringify({
  source,
  backup,
  total: entries.length,
  groups: counts,
  otherExamples: entries.filter((entry) => entry.group === "其他").slice(0, 30).map((entry) => entry.text),
}, null, 2));
