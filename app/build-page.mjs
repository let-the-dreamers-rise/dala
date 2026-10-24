// Inlines app/demo.json into app/template.html and writes app/index.html.
// The data is embedded because the hosted page cannot call the Solana RPC directly.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(dir, "demo.json"), "utf8"));
const required = ["programId", "vault", "vaultTokens", "pool", "mint", "vaultState", "balances", "steps"];
const missing = required.filter((k) => !(k in data));
if (missing.length) throw new Error(`demo.json is missing: ${missing.join(", ")}`);

// Escape "<" so no string in the data can close the script tag.
const json = JSON.stringify(data).replace(/</g, "\\u003c");
const template = fs.readFileSync(path.join(dir, "template.html"), "utf8");
fs.writeFileSync(path.join(dir, "story.html"), template.replace("__DEMO_JSON__", () => json));
console.log(`wrote app/story.html with ${data.steps.length} steps for vault ${data.vault}`);
