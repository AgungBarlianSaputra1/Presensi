// Worker tunggal: menyajikan index.html dan REST API di atas Cloudflare D1.
import html from "./index.html"; // diimpor sebagai teks (lihat [[rules]] di wrangler.toml)

// Tabel dibuat otomatis saat request pertama, jadi tidak perlu file schema.sql.
const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, kelas TEXT, created_at TEXT)",
  "CREATE TABLE IF NOT EXISTS faces (id TEXT PRIMARY KEY, vec TEXT NOT NULL)",
  "CREATE TABLE IF NOT EXISTS attendance (ts TEXT PRIMARY KEY, id TEXT NOT NULL, name TEXT, email TEXT, date TEXT NOT NULL, time TEXT, status TEXT, method TEXT, UNIQUE (id, date))",
  "CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(date)",
  "CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
];
let ready = false;
const ensureSchema = async (env) => { if (!ready) { await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))); ready = true; } };
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const [root, res, key] = url.pathname.split("/").filter(Boolean), m = req.method;
    if (root !== "api") return new Response(html, { headers: { "content-type": "text/html; charset=UTF-8", "cache-control": "no-cache" } });

    // Proteksi sederhana: API key rahasia (wrangler secret put API_KEY)
    if (env.API_KEY && req.headers.get("x-api-key") !== env.API_KEY) return J({ error: "Unauthorized" }, 401);

    await ensureSchema(env);
    const id = key ? decodeURIComponent(key) : null;
    const q = (sql, ...a) => env.DB.prepare(sql).bind(...a);
    const body = m === "GET" || m === "DELETE" ? null : await req.json().catch(() => ({}));

    try {
      if (res === "state" && m === "GET") {
        const [u, f, a, s] = await env.DB.batch([
          q("SELECT id,name,email,kelas,created_at AS createdAt FROM users ORDER BY created_at"),
          q("SELECT id,vec FROM faces"),
          q("SELECT ts,id,name,email,date,time,status,method FROM attendance ORDER BY ts"),
          q("SELECT k,v FROM settings"),
        ]);
        return J({
          users: u.results,
          faceData: Object.fromEntries(f.results.map((r) => [r.id, JSON.parse(r.vec)])),
          attendance: a.results,
          settings: Object.fromEntries(s.results.map((r) => [r.k, JSON.parse(r.v)])),
        });
      }
      if (res === "users" && m === "POST") {
        await q("INSERT INTO users (id,name,email,kelas,created_at) VALUES (?,?,?,?,?)", body.id, body.name, body.email, body.kelas, body.createdAt).run();
        return J({ ok: true }, 201);
      }
      if (res === "users" && m === "PUT") {
        await q("UPDATE users SET name=?, email=?, kelas=? WHERE id=?", body.name, body.email, body.kelas, id).run();
        return J({ ok: true });
      }
      if (res === "users" && m === "DELETE") {
        await env.DB.batch([q("DELETE FROM users WHERE id=?", id), q("DELETE FROM faces WHERE id=?", id)]);
        return J({ ok: true });
      }
      if (res === "faces" && m === "PUT") {
        await q("INSERT OR REPLACE INTO faces (id,vec) VALUES (?,?)", id, JSON.stringify(body.vec)).run();
        return J({ ok: true });
      }
      if (res === "attendance" && m === "POST") {
        await q("INSERT INTO attendance (ts,id,name,email,date,time,status,method) VALUES (?,?,?,?,?,?,?,?)",
          body.ts, body.id, body.name, body.email, body.date, body.time, body.status, body.method).run();
        return J({ ok: true }, 201);
      }
      if (res === "attendance" && m === "DELETE") {
        await (id ? q("DELETE FROM attendance WHERE ts=?", id) : q("DELETE FROM attendance")).run();
        return J({ ok: true });
      }
      if (res === "settings" && m === "PUT") {
        await env.DB.batch(Object.entries(body).map(([k, v]) => q("INSERT OR REPLACE INTO settings (k,v) VALUES (?,?)", k, JSON.stringify(v))));
        return J({ ok: true });
      }
      if (res === "clear" && m === "POST") {
        await env.DB.batch(["users", "faces", "attendance", "settings"].map((t) => q(`DELETE FROM ${t}`)));
        return J({ ok: true });
      }
      return J({ error: "Not found" }, 404);
    } catch (e) {
      return J({ error: /UNIQUE/.test(e.message) ? "Data sudah ada (ID atau presensi hari ini ganda)" : e.message }, /UNIQUE/.test(e.message) ? 409 : 500);
    }
  },
};
