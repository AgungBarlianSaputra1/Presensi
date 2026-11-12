import { FaceLandmarker, FilesetResolver, DrawingUtils }
  from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeStr = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/* ===================== DATABASE (LocalStorage) ===================== */
const read = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const DEFAULTS = { threshold: 0.1, lateTime: "08:00", sound: true, voice: true, volume: 0.7 };

const getSettings = () => ({ ...DEFAULTS, ...read("settings", {}) });
const getUsers = () => read("users", []);
const saveUser = (u) => { const a = getUsers(); a.push(u); write("users", a); };
const updateUser = (id, data) => write("users", getUsers().map((u) => (u.id === id ? { ...u, ...data } : u)));
const deleteUser = (id) => {
  write("users", getUsers().filter((u) => u.id !== id));
  const f = read("faceData", {}); delete f[id]; write("faceData", f);
};
const saveFaceData = (id, vec) => { const f = read("faceData", {}); f[id] = vec; write("faceData", f); };
const getAttendance = () => read("attendance", []);
const saveAttendance = (rec) => { const a = getAttendance(); a.push(rec); write("attendance", a); };
const deleteAttendance = (ts) => write("attendance", ts === "all" ? [] : getAttendance().filter((r) => r.ts !== ts));
const clearDatabase = () => ["users", "faceData", "attendance", "settings"].forEach((k) => localStorage.removeItem(k));

/** Bandingkan vektor fitur dengan semua wajah tersimpan (jarak Euclidean rata-rata per titik). */
function recognizeFace(vec) {
  const faces = read("faceData", {}), users = getUsers();
  let best = null;
  for (const [id, ref] of Object.entries(faces)) {
    let sum = 0;
    for (let i = 0; i < ref.length; i += 2) sum += Math.hypot(vec[i] - ref[i], vec[i + 1] - ref[i + 1]);
    const dist = sum / (ref.length / 2);
    if (!best || dist < best.distance) best = { id, distance: dist };
  }
  if (!best) return { match: false, distance: null };
  const user = users.find((u) => u.id === best.id);
  return { match: !!user && best.distance <= getSettings().threshold, user, distance: best.distance };
}

function exportAttendance(rows = getAttendance()) {
  const head = ["ID", "Nama", "Email", "Tanggal", "Jam", "Status", "Metode"];
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [head, ...rows.map((r) => [r.id, r.name, r.email, r.date, r.time, r.status, r.method])].map((r) => r.map(q).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
  a.download = `presensi_${todayStr()}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

/* ===================== SUARA (Web Audio + Speech Synthesis) ===================== */
let actx = null;
/** Satu nada sintetis: frekuensi, jeda mulai, durasi, bentuk gelombang, volume, (opsional) meluncur ke frekuensi lain. */
function tone(f, t0, dur, type = "sine", vol = 0.25, slideTo) {
  const st = getSettings(); if (!st.sound) return;
  actx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === "suspended") actx.resume();
  const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + t0, v = Math.max(vol * st.volume, 0.0003);
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.05);
}
const sfx = {
  success() { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { tone(f, i * 0.09, 0.4, "triangle", 0.3); tone(f * 2, i * 0.09, 0.22, "sine", 0.08); }); }, // arpeggio C mayor naik
  info() { tone(659.25, 0, 0.18, "sine", 0.25); tone(523.25, 0.14, 0.3, "sine", 0.25); },
  fail() { tone(220, 0, 0.22, "sawtooth", 0.14, 150); tone(165, 0.18, 0.32, "sawtooth", 0.14, 110); },
  detect() { tone(880, 0, 0.07, "sine", 0.15); tone(1174.7, 0.07, 0.1, "sine", 0.15); },
  on() { tone(440, 0, 0.14, "triangle", 0.2, 880); },
  shutter() { tone(1800, 0, 0.04, "square", 0.08); tone(900, 0.05, 0.07, "square", 0.08); },
};
function speak(text) {
  const st = getSettings(); if (!st.voice || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "id-ID"; u.pitch = 1.05; u.volume = Math.max(0.3, st.volume);
  const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith("id"));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
const salam = (h) => (h < 11 ? "pagi" : h < 15 ? "siang" : h < 18 ? "sore" : "malam");
if ("speechSynthesis" in window) speechSynthesis.getVoices(); // pancing pemuatan daftar suara

/* ===================== MEDIAPIPE & KAMERA ===================== */
let landmarker = null, stream = null, raf = 0, activeVideo = null;

async function initLandmarker() {
  if (landmarker) return landmarker;
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const opts = (delegate) => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: "VIDEO", numFaces: 1 });
  try { landmarker = await FaceLandmarker.createFromOptions(fileset, opts("GPU")); }
  catch { landmarker = await FaceLandmarker.createFromOptions(fileset, opts("CPU")); }
  return landmarker;
}

/** Normalisasi: pusat di ujung hidung, rotasi sejajar garis mata, skala jarak antar-mata. */
function normalize(lm, w, h) {
  const a = lm[33], b = lm[263], n = lm[1];
  const ang = Math.atan2((b.y - a.y) * h, (b.x - a.x) * w), c = Math.cos(-ang), s = Math.sin(-ang);
  const d = Math.hypot((b.x - a.x) * w, (b.y - a.y) * h) || 1, out = [];
  for (let i = 0; i < 468; i++) {
    const x = ((lm[i].x - n.x) * w) / d, y = ((lm[i].y - n.y) * h) / d;
    out.push(+(x * c - y * s).toFixed(4), +(x * s + y * c).toFixed(4));
  }
  return out;
}

/** Nyalakan kamera + loop deteksi. onResult(landmarks|null, vec|null) dipanggil tiap frame. */
async function startCamera(video, canvas, onResult) {
  stopCamera();
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Browser tidak mendukung kamera atau halaman tidak memakai HTTPS/localhost.");
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false }); }
  catch (e) {
    throw new Error(e.name === "NotAllowedError" ? "Izin kamera ditolak. Izinkan akses kamera di browser."
      : e.name === "NotFoundError" ? "Kamera tidak ditemukan." : "Kamera gagal dibuka: " + e.message);
  }
  video.srcObject = stream; activeVideo = video;
  await video.play();
  const lm = await initLandmarker();
  sfx.on();
  const ctx = canvas.getContext("2d"), draw = new DrawingUtils(ctx);
  let lastT = -1;
  const loop = () => {
    if (!stream) return;
    if (video.currentTime !== lastT && video.videoWidth) {
      lastT = video.currentTime;
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const res = lm.detectForVideo(video, performance.now());
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const pts = res.faceLandmarks?.[0];
      if (pts) {
        draw.drawConnectors(pts, FaceLandmarker.FACE_LANDMARKS_TESSELATION, { color: "#7fb0ff55", lineWidth: 0.5 });
        draw.drawLandmarks(pts, { color: "#ffffff", radius: 0.8 });
        const xs = pts.map((p) => p.x * canvas.width), ys = pts.map((p) => p.y * canvas.height);
        const x = Math.min(...xs), y = Math.min(...ys);
        ctx.strokeStyle = "#3fd68f"; ctx.lineWidth = 3;
        ctx.strokeRect(x, y, Math.max(...xs) - x, Math.max(...ys) - y);
        onResult(pts, normalize(pts, canvas.width, canvas.height));
      } else onResult(null, null);
    }
    raf = requestAnimationFrame(loop);
  };
  loop();
}

function stopCamera() {
  cancelAnimationFrame(raf); raf = 0;
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  if (activeVideo) { activeVideo.srcObject = null; activeVideo = null; }
  document.querySelectorAll(".cam canvas").forEach((c) => c.getContext("2d").clearRect(0, 0, c.width, c.height));
}

const setStatus = (el, on, text) => { el.className = "status " + (on === true ? "on" : on === false ? "bad" : ""); el.innerHTML = `<i class="fa-solid fa-circle"></i> ${text}`; };
const toast = (icon, title, text, silent) => {
  if (!silent) (icon === "success" ? sfx.success : icon === "info" ? sfx.info : sfx.fail)();
  return Swal.fire({ icon, title, text, timer: 2200, showConfirmButton: false });
};
/** Dialog error/peringatan + bunyi sesuai jenisnya. */
const warn = (t, x, i) => { (i === "error" || i === "warning" ? sfx.fail : sfx.info)(); return Swal.fire(t, x, i); };

/* ===================== NAVIGASI & DASHBOARD ===================== */
const titles = { dashboard: "Dashboard", register: "Registrasi Wajah", scan: "Scan Wajah", users: "Data Pengguna", history: "Riwayat Presensi", settings: "Pengaturan" };
function showPage(name) {
  stopCamera(); resetRegister(); resetScan(); // kamera selalu mati saat pindah halaman
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === name));
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.page === name));
  $("pageTitle").textContent = titles[name]; $("sidebar").classList.remove("open");
  ({ dashboard: renderDashboard, users: renderUsers, history: renderHistory, settings: renderSettings })[name]?.();
}
document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => showPage(b.dataset.page)));
$("menuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));

function tick() {
  const d = new Date();
  $("clock").textContent = timeStr(d);
  $("date").textContent = d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
setInterval(tick, 1000); tick();

const badge = (s) => `<span class="badge ${s === "Hadir" ? "" : "warn"}">${esc(s)}</span>`;
function renderDashboard() {
  const users = getUsers(), today = getAttendance().filter((r) => r.date === todayStr());
  const present = new Set(today.map((r) => r.id)).size;
  $("stUsers").textContent = users.length; $("stToday").textContent = today.length;
  $("stPresent").textContent = present; $("stAbsent").textContent = Math.max(users.length - present, 0);
  const recent = getAttendance().slice(-5).reverse();
  $("recentBody").innerHTML = recent.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.date}</td><td>${r.time}</td><td>${badge(r.status)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">Belum ada presensi.</td></tr>`;
}

/* ===================== REGISTRASI ===================== */
let capturedVec = null, latest = null;
function resetRegister() {
  capturedVec = null; latest = null;
  $("rCapture").disabled = true; $("rSave").disabled = true; $("rPreview").hidden = true;
  setStatus($("rStatus"), null, "Kamera mati");
}
$("rOpen").addEventListener("click", async () => {
  setStatus($("rStatus"), null, "Memuat kamera & MediaPipe...");
  try {
    await startCamera($("rVideo"), $("rCanvas"), (pts, vec) => {
      latest = vec ? { vec, pts } : null;
      setStatus($("rStatus"), !!vec, vec ? "Wajah terdeteksi" : "Wajah belum terdeteksi");
    });
    $("rCapture").disabled = false;
  } catch (e) { setStatus($("rStatus"), false, e.message); warn("Gagal", e.message, "error"); }
});
$("rCapture").addEventListener("click", () => {
  if (!latest) return warn("Wajah tidak terdeteksi", "Hadapkan wajah ke kamera dengan pencahayaan cukup.", "warning");
  // Validasi: wajah harus cukup besar di dalam frame
  const xs = latest.pts.map((p) => p.x), width = Math.max(...xs) - Math.min(...xs);
  if (width < 0.25) return warn("Wajah terlalu jauh", "Dekatkan wajah ke kamera.", "warning");
  capturedVec = latest.vec;
  const v = $("rVideo"), c = document.createElement("canvas"); c.width = 160; c.height = 120;
  c.getContext("2d").drawImage(v, 0, 0, 160, 120);
  $("rPreview").src = c.toDataURL("image/jpeg", 0.7); $("rPreview").hidden = false;
  $("rSave").disabled = false; sfx.shutter(); toast("success", "Foto & landmark diambil", undefined, true);
});
$("rSave").addEventListener("click", () => {
  const u = { id: $("rId").value.trim(), name: $("rName").value.trim(), email: $("rEmail").value.trim(), kelas: $("rClass").value.trim(), createdAt: new Date().toISOString() };
  if (!u.id || !u.name || !u.email || !u.kelas) return warn("Form belum lengkap", "Isi semua kolom.", "warning");
  if (!/^\S+@\S+\.\S+$/.test(u.email)) return warn("Email tidak valid", "", "warning");
  if (getUsers().some((x) => x.id.toLowerCase() === u.id.toLowerCase())) return warn("ID sudah terdaftar", "Gunakan ID pengguna yang berbeda.", "error");
  if (!capturedVec) return warn("Wajah belum diambil", "Klik Ambil Foto terlebih dahulu.", "warning");
  saveUser(u); saveFaceData(u.id, capturedVec);
  ["rId", "rName", "rEmail", "rClass"].forEach((i) => ($(i).value = ""));
  stopCamera(); resetRegister(); toast("success", "Registrasi berhasil", u.name);
});

/* ===================== SCAN & PRESENSI ===================== */
let streak = { id: null, n: 0 }, cooldownUntil = 0, hadFace = false, lastFail = 0;
function resetScan() {
  streak = { id: null, n: 0 }; hadFace = false;
  $("sStart").disabled = false; $("sStop").disabled = true;
  setStatus($("sCam"), null, "Kamera mati"); setStatus($("sFace"), null, "Wajah belum terdeteksi");
  $("sResult").className = "result"; $("sResult").textContent = "Hasil pencocokan akan tampil di sini.";
}
function markAttendance(user) {
  const now = new Date(), date = todayStr(now);
  // Aturan: satu presensi per pengguna per hari (dicek langsung di database)
  if (getAttendance().some((r) => r.id === user.id && r.date === date)) {
    $("sResult").className = "result ok"; $("sResult").innerHTML = `<b>${esc(user.name)}</b>Anda sudah melakukan presensi hari ini`;
    speak("Anda sudah melakukan presensi hari ini");
    return toast("info", "Anda sudah melakukan presensi hari ini", user.name);
  }
  const [lh, lm] = getSettings().lateTime.split(":").map(Number);
  const late = now.getHours() * 60 + now.getMinutes() > lh * 60 + lm;
  saveAttendance({ ts: now.getTime() + "-" + user.id, id: user.id, name: user.name, email: user.email, date, time: timeStr(now), status: late ? "Terlambat" : "Hadir", method: "Scan Wajah" });
  $("sResult").className = "result ok"; $("sResult").innerHTML = `<b>${esc(user.name)}</b>Presensi berhasil (${late ? "Terlambat" : "Hadir"})`;
  toast("success", "Presensi berhasil", user.name);
  speak(`Presensi berhasil. Selamat ${salam(now.getHours())}, ${user.name}.${late ? " Anda terlambat hari ini." : ""}`);
}
$("sStart").addEventListener("click", async () => {
  setStatus($("sCam"), null, "Memuat kamera & MediaPipe...");
  try {
    await startCamera($("sVideo"), $("sCanvas"), (pts, vec) => {
      setStatus($("sFace"), !!vec, vec ? "Wajah terdeteksi" : "Wajah belum terdeteksi");
      if (vec && !hadFace) sfx.detect(); // bunyi singkat saat wajah baru masuk frame
      hadFace = !!vec;
      if (!vec || performance.now() < cooldownUntil) return;
      const r = recognizeFace(vec);
      if (!r.match) {
        streak = { id: null, n: 0 };
        if (performance.now() - lastFail > 3500) { lastFail = performance.now(); sfx.fail(); speak("Wajah tidak dikenali"); }
        $("sResult").className = "result bad";
        $("sResult").innerHTML = `<b>Wajah tidak dikenali</b>${r.distance != null ? "Jarak terdekat: " + r.distance.toFixed(3) : "Belum ada wajah terdaftar."}`;
        return;
      }
      streak = streak.id === r.user.id ? { id: streak.id, n: streak.n + 1 } : { id: r.user.id, n: 1 };
      $("sResult").className = "result ok"; $("sResult").innerHTML = `<b>${esc(r.user.name)}</b>Jarak ${r.distance.toFixed(3)} · memverifikasi...`;
      if (streak.n >= 8) { // 8 frame berturut-turut -> cegah salah cocok & presensi ganda
        cooldownUntil = performance.now() + 5000; streak = { id: null, n: 0 };
        markAttendance(r.user);
      }
    });
    setStatus($("sCam"), true, "Kamera aktif"); $("sStart").disabled = true; $("sStop").disabled = false;
  } catch (e) { setStatus($("sCam"), false, e.message); warn("Gagal", e.message, "error"); }
});
$("sStop").addEventListener("click", () => { stopCamera(); resetScan(); });

/* ===================== DATA PENGGUNA ===================== */
function renderUsers() {
  const q = $("uSearch").value.toLowerCase(), faces = read("faceData", {}), all = getUsers();
  const rows = all.filter((u) => [u.id, u.name, u.email, u.kelas].join(" ").toLowerCase().includes(q));
  $("uCount").textContent = `${all.length} pengguna terdaftar`;
  $("uBody").innerHTML = rows.map((u, i) => `<tr><td>${i + 1}</td><td>${esc(u.id)}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.kelas)}</td>
    <td><span class="badge ${faces[u.id] ? "" : "bad"}">${faces[u.id] ? "Terdaftar" : "Belum"}</span></td>
    <td><button class="btn sm" data-edit="${esc(u.id)}"><i class="fa-solid fa-pen"></i>Edit</button> <button class="btn sm danger" data-del="${esc(u.id)}"><i class="fa-solid fa-trash"></i>Hapus</button></td></tr>`).join("") || `<tr><td colspan="7" class="empty">Tidak ada data pengguna.</td></tr>`;
}
$("uSearch").addEventListener("input", renderUsers);
$("uBody").addEventListener("click", async (e) => {
  const btn = e.target.closest("button"); if (!btn) return;
  if (btn.dataset.del) {
    const u = getUsers().find((x) => x.id === btn.dataset.del);
    const r = await Swal.fire({ title: "Hapus pengguna?", text: `${u.name} dan data wajahnya akan dihapus.`, icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal", confirmButtonColor: "#d23b3b" });
    if (r.isConfirmed) { deleteUser(u.id); renderUsers(); toast("success", "Pengguna dihapus"); }
  } else if (btn.dataset.edit) {
    const u = getUsers().find((x) => x.id === btn.dataset.edit);
    const r = await Swal.fire({
      title: "Edit pengguna", showCancelButton: true, confirmButtonText: "Simpan", cancelButtonText: "Batal",
      html: `<input id="eN" class="swal2-input" placeholder="Nama" value="${esc(u.name)}"><input id="eE" class="swal2-input" placeholder="Email" value="${esc(u.email)}"><input id="eK" class="swal2-input" placeholder="Kelas / Divisi" value="${esc(u.kelas)}">`,
      preConfirm: () => {
        const d = { name: $("eN").value.trim(), email: $("eE").value.trim(), kelas: $("eK").value.trim() };
        if (!d.name || !/^\S+@\S+\.\S+$/.test(d.email) || !d.kelas) return Swal.showValidationMessage("Isi nama, email valid, dan kelas/divisi.");
        return d;
      },
    });
    if (r.isConfirmed) { updateUser(u.id, r.value); renderUsers(); toast("success", "Data diperbarui"); }
  }
});

/* ===================== RIWAYAT ===================== */
const filteredHistory = () => {
  const d = $("hDate").value, q = $("hSearch").value.toLowerCase(), s = $("hStatus").value;
  return getAttendance().filter((r) => (!d || r.date === d) && (!q || r.name.toLowerCase().includes(q)) && (!s || r.status === s));
};
function renderHistory() {
  const rows = filteredHistory();
  $("hCount").textContent = `Total kehadiran: ${rows.length}`;
  $("hBody").innerHTML = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.id)}</td><td>${esc(r.name)}</td><td>${r.date}</td><td>${r.time}</td><td>${badge(r.status)}</td><td>${esc(r.method)}</td>
    <td><button class="btn sm danger" data-del="${esc(r.ts)}" aria-label="Hapus"><i class="fa-solid fa-trash"></i></button></td></tr>`).join("") || `<tr><td colspan="8" class="empty">Tidak ada riwayat presensi.</td></tr>`;
}
["hDate", "hSearch", "hStatus"].forEach((i) => $(i).addEventListener("input", renderHistory));
$("hExport").addEventListener("click", () => { const r = filteredHistory(); r.length ? exportAttendance(r) : warn("Tidak ada data untuk diexport", "", "info"); });
$("hBody").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-del]"); if (!b) return;
  const r = await Swal.fire({ title: "Hapus catatan ini?", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus", cancelButtonText: "Batal" });
  if (r.isConfirmed) { deleteAttendance(b.dataset.del); renderHistory(); }
});
$("hClear").addEventListener("click", async () => {
  const r = await Swal.fire({ title: "Hapus seluruh riwayat?", text: "Tindakan ini tidak dapat dibatalkan.", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus semua", cancelButtonText: "Batal", confirmButtonColor: "#d23b3b" });
  if (r.isConfirmed) { deleteAttendance("all"); renderHistory(); toast("success", "Riwayat dihapus"); }
});

/* ===================== PENGATURAN ===================== */
function renderSettings() {
  const s = getSettings(); $("setThr").value = s.threshold; $("setLate").value = s.lateTime;
  $("setSound").checked = s.sound; $("setVoice").checked = s.voice; $("setVol").value = s.volume;
}
// Pengaturan suara tersimpan langsung saat diubah
function persistSound() {
  write("settings", { ...getSettings(), sound: $("setSound").checked, voice: $("setVoice").checked, volume: parseFloat($("setVol").value) });
  syncSoundBtn();
}
["setSound", "setVoice", "setVol"].forEach((i) => $(i).addEventListener("change", persistSound));
$("setTest").addEventListener("click", () => { sfx.success(); speak(`Tes suara. Presensi berhasil. Selamat ${salam(new Date().getHours())}.`); });
function syncSoundBtn() { const s = getSettings(); $("soundBtn").innerHTML = `<i class="fa-solid ${s.sound || s.voice ? "fa-volume-high" : "fa-volume-xmark"}"></i>`; }
$("soundBtn").addEventListener("click", () => { // tombol cepat: bisukan / aktifkan semua suara
  const s = getSettings(), on = !(s.sound || s.voice);
  write("settings", { ...s, sound: on, voice: on }); syncSoundBtn(); if (on) sfx.on(); else speechSynthesis?.cancel();
});
syncSoundBtn();
$("setSave").addEventListener("click", () => {
  const t = parseFloat($("setThr").value);
  if (!(t > 0) || !$("setLate").value) return warn("Nilai tidak valid", "", "warning");
  write("settings", { ...getSettings(), threshold: t, lateTime: $("setLate").value }); toast("success", "Pengaturan disimpan");
});
$("setClear").addEventListener("click", async () => {
  const r = await Swal.fire({ title: "Hapus seluruh database?", text: "Pengguna, data wajah, presensi, dan pengaturan akan hilang.", icon: "warning", showCancelButton: true, confirmButtonText: "Hapus semua", cancelButtonText: "Batal", confirmButtonColor: "#d23b3b" });
  if (r.isConfirmed) { clearDatabase(); renderSettings(); toast("success", "Database dikosongkan"); }
});

window.addEventListener("beforeunload", stopCamera);
renderDashboard();
