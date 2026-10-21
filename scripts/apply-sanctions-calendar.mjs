import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  const text = readFileSync(path, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan credenciales");
  process.exit(1);
}

const sql = readFileSync(resolve(root, "supabase/migrations/20261021010000_sanctions_calendar.sql"), "utf8");
const endpoints = [`${url.replace(/\/$/, "")}/pg/query`, `${url.replace(/\/$/, "")}/rest/v1/rpc/exec_sql`];

async function tryQuery() {
  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(endpoint.endsWith("exec_sql") ? { sql } : { query: sql }),
    });
    const text = await res.text();
    if (res.ok) {
      console.log("ok", endpoint);
      return true;
    }
    console.log("no", res.status, endpoint, text.slice(0, 180));
  }
  return false;
}

const ok = await tryQuery();
process.exit(ok ? 0 : 2);
