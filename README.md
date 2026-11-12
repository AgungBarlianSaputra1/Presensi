# Sistem Presensi Wajah (Cloudflare Worker + D1)

Tiga file aplikasi: `index.html` (tampilan + logika), `index.js` (Worker + API), `wrangler.toml` (konfigurasi).
Prototipe: pencocokan memakai geometri landmark wajah, bukan autentikasi biometrik yang aman.

## Dari nol sampai online
1. Daftar akun gratis di https://dash.cloudflare.com
2. Pasang Node.js (LTS) dari https://nodejs.org
3. Buka terminal di folder ini, lalu `npx wrangler login`
4. `npx wrangler d1 create presensi-db` -> salin `database_id` ke `wrangler.toml`
5. `npx wrangler secret put API_KEY` -> isi password pilihanmu
6. `npx wrangler deploy` -> buka URL `*.workers.dev` yang muncul
7. Saat pertama dibuka, masukkan API key tadi. Tabel dibuat otomatis.

## Uji lokal
```
echo "API_KEY=rahasia" > .dev.vars
npx wrangler dev
```
Buka http://localhost:8787 (kamera butuh localhost atau HTTPS).

## GitHub
`git init && git add . && git commit -m "presensi wajah" && git push` (setelah `git remote add origin ...`).
Jangan commit `.dev.vars`. Data wajah adalah data sensitif: gunakan repo private dan pertimbangkan Cloudflare Access.
