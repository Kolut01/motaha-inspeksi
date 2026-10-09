/*
 * MOTAHA Inspeksi — aplikasi HP (PWA) untuk form Inspeksi dan Tindak Lanjut.
 * - Semua isian disimpan dulu di HP (IndexedDB), lalu dikirim ke Web App MOTAHA saat ada sinyal.
 * - Kiriman membawa ID buatan HP (idKlien) sehingga kiriman ulang tidak tercatat dua kali.
 * - Pilihan form & temuan terbuka disimpan di HP agar form tetap jalan tanpa sinyal.
 */
'use strict';

var VERSI_PWA = '2026-10-09.10';
var VERSI_SERVER_MIN = '2026-10-09.10'; // script MOTAHA (Apps Script) paling lama yang punya aksi untuk aplikasi HP (menu ROW)
// Berjalan sebagai APK (Capacitor)? Berkas aplikasi sudah ada di dalam APK -> tanpa service worker;
// pembaruan dicek ke rilis GitHub (window.MOTAHA_REPO diisi saat APK dibangun).
var DI_APK = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
var KUNCI = { api: 'motaha-api', sesi: 'motaha-sesi', data: 'motaha-data', tema: 'motaha-tema', dataRow: 'motaha-data-row', wo: 'motaha-wo' };

var S = {
  api: '', sesi: null, data: null, antrean: [], tab: 'input', draf: null, detail: null, eks: null,
  mengirim: false, memuatData: false, pesan: null, gantiAntre: null, lembar: false, pasang: null,
  cari: '', saringPy: '', terakhirKirim: null, pembaruan: null, tlMode: 'belum', foto: {},
  dataRow: null, drafRow: null, pesanRow: '', absenForm: null, wo: null, formRow: false, detailReal: null, saringRegu: ''
};

/* ---------- Util ---------- */
function $(s) { return document.querySelector(s); }
function esc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function bacaLokal(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function tulisLokal(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* penuh/diblokir */ } }
function hariIni() {
  var d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function hex(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('').toUpperCase(); }
function tglTampil(iso) {
  if (!iso) return '';
  var b = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); if (!m) return iso;
  return +m[3] + ' ' + b[+m[2] - 1] + ' ' + m[1];
}
function jamTampil(iso) { var d = new Date(iso); return isNaN(d) ? '' : tglTampil(iso.slice(0, 10)) + ' ' + ('0' + d.getHours()).slice(-2) + '.' + ('0' + d.getMinutes()).slice(-2); }
function galat(pesan, kode) { var e = new Error(pesan); e.kode = kode; return e; }
function koordinatSah(t) {
  var m = /^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/.exec(String(t || ''));
  if (!m) return false;
  var a = parseFloat(m[1].replace(',', '.')), b = parseFloat(m[2].replace(',', '.'));
  return a >= -90 && a <= 90 && b >= -180 && b <= 180;
}
var IKON = {
  input: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg>',
  tl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>',
  antre: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  row: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22V12"/><path d="M12 12c-4 0-7-2.5-7-6 3 0 6 1 7 4 1-3 4-4 7-4 0 3.5-3 6-7 6z"/><path d="M4 22h16"/></svg>',
  real: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  kamera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="4"/></svg>'
};

/* ---------- Penyimpanan di HP (IndexedDB) ---------- */
var DB = (function () {
  var janji = null;
  function buka() {
    if (!janji) janji = new Promise(function (ok, gagal) {
      var r = indexedDB.open('motaha-inspeksi', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('antrean', { keyPath: 'idAntre' }); r.result.createObjectStore('kv'); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { gagal(r.error); };
    });
    return janji;
  }
  function tx(nama, mode, kerja) {
    return buka().then(function (db) {
      return new Promise(function (ok, gagal) {
        var t = db.transaction(nama, mode), q = kerja(t.objectStore(nama)), hasil;
        if (q) q.onsuccess = function () { hasil = q.result; };
        t.oncomplete = function () { ok(hasil); };
        t.onerror = t.onabort = function () { gagal(t.error || new Error('Penyimpanan HP gagal.')); };
      });
    });
  }
  return {
    semua: function () { return tx('antrean', 'readonly', function (s) { return s.getAll(); }); },
    simpan: function (x) { return tx('antrean', 'readwrite', function (s) { return s.put(x); }); },
    hapus: function (id) { return tx('antrean', 'readwrite', function (s) { return s.delete(id); }); },
    ambil: function (k) { return tx('kv', 'readonly', function (s) { return s.get(k); }); },
    taruh: function (k, v) { return tx('kv', 'readwrite', function (s) { return s.put(v, k); }); }
  };
})();

/* ---------- Server ---------- */
async function panggil(aksi, muatan) {
  var r;
  try {
    r = await fetch(S.api, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // tanpa preflight CORS
      body: JSON.stringify({ action: aksi, payload: muatan || {} })
    });
  } catch (e) { throw galat('Tidak ada koneksi ke server.', 'JARINGAN'); }
  if (!r.ok) throw galat('Server tidak menjawab (HTTP ' + r.status + ').', 'JARINGAN');
  var teks = await r.text();
  try { return JSON.parse(teks); } catch (e) {
    throw galat('Jawaban server tidak dikenali. Periksa alamat Web App (berakhiran /exec, akses "Anyone").', 'SERVER');
  }
}

async function api(aksi, muatan) {
  if (!S.sesi || S.sesi.habis) throw galat('Silakan masuk lagi.', 'MASUK');
  var j = await panggil(aksi, Object.assign({}, muatan, { token: S.sesi.token }));
  if (!j.ok && j.kode === 'SESI_HABIS') {
    await perbaruiSesi();
    j = await panggil(aksi, Object.assign({}, muatan, { token: S.sesi.token }));
  }
  if (!j.ok) {
    if (/^Unknown action/.test(j.error || '')) throw galat('Script MOTAHA di server belum diperbarui ke versi ' + VERSI_SERVER_MIN + '. Hubungi admin.', 'VERSI');
    throw galat(j.error || 'Permintaan ditolak server.', j.kode || 'DITOLAK');
  }
  return j;
}

async function perbaruiSesi() {
  var j = await panggil('masukPerangkat', { kunciPerangkat: S.sesi.kunci });
  if (!j.ok) {
    if (/^Unknown action/.test(j.error || '')) throw galat('Script MOTAHA di server belum diperbarui ke versi ' + VERSI_SERVER_MIN + '. Hubungi admin.', 'VERSI');
    S.sesi.habis = true; tulisLokal(KUNCI.sesi, S.sesi);
    throw galat(j.error || 'Silakan masuk lagi.', 'MASUK');
  }
  S.sesi.token = j.token; S.sesi.pengguna = j.pengguna; tulisLokal(KUNCI.sesi, S.sesi);
}

async function muatData(diam) {
  if (S.memuatData || !navigator.onLine) return;
  S.memuatData = true; if (!diam) gambar();
  try {
    var d = await api('dataInspeksiMobile');
    S.data = d; tulisLokal(KUNCI.data, d);
    try {
      var r = await api('dataRowMobile');
      S.dataRow = r; S.pesanRow = ''; tulisLokal(KUNCI.dataRow, r);
    } catch (e2) { S.pesanRow = e2.message; }
  } catch (e) {
    if (!diam || e.kode === 'VERSI' || e.kode === 'MASUK') S.pesan = { jenis: 'galat', teks: e.message };
  } finally { S.memuatData = false; gambar(); }
}

/* ---------- Antrean kiriman ---------- */
async function muatAntrean() {
  try { S.antrean = (await DB.semua()).sort(function (a, b) { return a.dibuat < b.dibuat ? -1 : 1; }); }
  catch (e) { S.antrean = []; S.pesan = { jenis: 'galat', teks: 'Penyimpanan HP tidak bisa dibuka: ' + e.message }; }
}

async function kirimAntrean() {
  if (S.mengirim || !navigator.onLine || !S.sesi || S.sesi.habis) return;
  var tunggu = S.antrean.filter(function (x) { return x.status !== 'ditolak'; });
  if (!tunggu.length) return;
  S.mengirim = true; gambar();
  var terkirim = 0;
  try {
    for (var i = 0; i < tunggu.length; i++) {
      var item = tunggu[i];
      try {
        await api(item.aksi, Object.assign({}, item.muatan, { ringkas: true }));
        await DB.hapus(item.idAntre); terkirim++;
      } catch (e) {
        if (e.kode === 'SUDAH_EKSEKUSI') { await DB.hapus(item.idAntre); terkirim++; continue; }
        if (e.kode === 'JARINGAN' || e.kode === 'SERVER' || e.kode === 'MASUK' || e.kode === 'VERSI') {
          item.pesan = e.message; item.percobaan = (item.percobaan || 0) + 1; await DB.simpan(item);
          if (e.kode !== 'JARINGAN') S.pesan = { jenis: 'galat', teks: e.message };
          break;
        }
        item.status = 'ditolak'; item.pesan = e.message; await DB.simpan(item);
      }
    }
  } finally {
    S.mengirim = false;
    await muatAntrean();
    if (terkirim) {
      S.terakhirKirim = new Date().toISOString();
      toast(terkirim + ' data terkirim ke MOTAHA.');
      muatData(true);
    }
    gambar();
  }
}

/* ---------- Foto ---------- */
/* ---------- Foto + cap waktu & koordinat ----------
 * Setiap foto diberi cap di pojok kiri bawah: waktu foto diambil, titik koordinat, dan nama aplikasi.
 * - Waktu: dari EXIF kamera (DateTimeOriginal) bila ada, kalau tidak = saat foto dipilih.
 * - Koordinat: dari GPS di EXIF foto bila ada; kalau tidak, dari GPS HP saat itu — hanya bila foto baru
 *   diambil (≤ 10 menit), supaya foto lama dari galeri tidak diberi lokasi tempat petugas berdiri sekarang.
 */
var NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function zonaWaktu(d) {
  var m = -d.getTimezoneOffset();
  return { 420: 'WIB', 480: 'WITA', 540: 'WIT' }[m] || ('GMT' + (m >= 0 ? '+' : '-') + Math.floor(Math.abs(m) / 60));
}
function teksCapWaktu(d) {
  var dua = function (n) { return (n < 10 ? '0' : '') + n; };
  return dua(d.getDate()) + ' ' + NAMA_BULAN[d.getMonth()] + ' ' + d.getFullYear() + '  ' +
    dua(d.getHours()) + '.' + dua(d.getMinutes()) + '.' + dua(d.getSeconds()) + ' ' + zonaWaktu(d);
}

function lokasiHp(batasMs) {
  return new Promise(function (ok) {
    if (!navigator.geolocation) { ok(null); return; }
    var selesai = false, akhiri = function (x) { if (!selesai) { selesai = true; ok(x); } };
    setTimeout(function () { akhiri(null); }, batasMs);
    navigator.geolocation.getCurrentPosition(function (p) {
      akhiri({ koordinat: p.coords.latitude.toFixed(6) + ', ' + p.coords.longitude.toFixed(6), akurasi: Math.round(p.coords.accuracy) });
    }, function () { akhiri(null); }, { enableHighAccuracy: true, timeout: batasMs, maximumAge: 60000 });
  });
}

function bacaBerkas(berkas) {
  return new Promise(function (ok, gagal) {
    var r = new FileReader();
    r.onload = function () { ok(r.result); };
    r.onerror = function () { gagal(new Error('Berkas tidak bisa dibaca.')); };
    r.readAsArrayBuffer(berkas);
  });
}
function muatGambar(berkas) {
  return new Promise(function (ok, gagal) {
    var url = URL.createObjectURL(berkas), img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); ok(img); };
    img.onerror = function () { URL.revokeObjectURL(url); gagal(new Error('Gambar tidak bisa dibaca.')); };
    img.src = url;
  });
}

function gambarCap(c, baris) {
  var ctx = c.getContext('2d');
  var uk = Math.max(15, Math.round(Math.min(c.width, c.height) * 0.032));
  var pad = Math.round(uk * 0.7), jarak = Math.round(uk * 1.32);
  ctx.font = '600 ' + uk + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'top';
  var lebar = 0; baris.forEach(function (b) { lebar = Math.max(lebar, ctx.measureText(b.teks).width); });
  var w = Math.ceil(lebar + pad * 2 + uk * 0.4), h = jarak * baris.length + pad * 2 - (jarak - uk);
  var x = pad, y = c.height - h - pad;
  ctx.fillStyle = 'rgba(11, 46, 74, 0.72)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.round(uk * 0.45)); else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.fillStyle = '#F5C518'; ctx.fillRect(x, y, Math.max(3, Math.round(uk * 0.22)), h); // garis kuning khas MOTAHA
  baris.forEach(function (b, i) {
    ctx.font = (b.tebal ? '700 ' : '500 ') + uk + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = b.warna || '#FFFFFF';
    ctx.fillText(b.teks, x + pad + uk * 0.2, y + pad + i * jarak);
  });
}

async function siapkanFoto(berkas, label, lokasi) {
  if (!berkas || !/^image\//.test(berkas.type)) throw new Error('Berkas harus berupa gambar.');
  var dipilih = new Date();
  var mintaLokasi = lokasiHp(12000); // jalan bersamaan dengan membaca foto
  var buf = await bacaBerkas(berkas);
  var koorExif = koordinatDariExif(buf), waktuExif = waktuDariExif(buf);
  var waktu = waktuExif ? new Date(waktuExif) : dipilih;
  if (isNaN(waktu)) waktu = dipilih;
  var baru = !waktuExif || Math.abs(dipilih - waktu) <= 10 * 60000;
  var koordinat = koorExif, akurasi = null, sumber = koorExif ? 'foto' : '';
  if (!koordinat && baru) {
    toast('Mengambil lokasi untuk cap foto…');
    var l = await mintaLokasi;
    if (l) { koordinat = l.koordinat; akurasi = l.akurasi; sumber = 'hp'; }
  }
  var img = await muatGambar(berkas);
  var maks = 1600, s = Math.min(1, maks / Math.max(img.naturalWidth, img.naturalHeight));
  var c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  gambarCap(c, [
    { teks: teksCapWaktu(waktu), tebal: true },
    { teks: koordinat ? koordinat + (akurasi !== null ? '  ±' + akurasi + ' m' : '') : 'Koordinat tidak tersedia', warna: koordinat ? '#FFFFFF' : '#F2C76A' },
    lokasi ? { teks: lokasi, tebal: true } : null,
    { teks: label || 'MOTAHA Inspeksi · ULP Kolaka Utara', warna: '#B9CCDD' }
  ].filter(Boolean));
  var data = c.toDataURL('image/jpeg', 0.82);
  return { mime: 'image/jpeg', data: data, koordinat: koordinat, sumberKoordinat: sumber, waktu: waktu.toISOString(),
    kb: Math.round(data.length * 0.75 / 1024) };
}

function htmlFoto(id, label, wajib, ada) {
  return '<div class="medan"><span class="label">' + label + (wajib ? ' <span class="wajib">*</span>' : '') + '</span>' +
    '<label class="unggah" for="' + id + '"><input id="' + id + '" type="file" accept="image/*" capture="environment">' +
    (ada ? '<img src="' + ada.data + '" alt="' + esc(label) + '">' :
      '<span class="kosong">' + IKON.kamera + '<b>Ambil / pilih foto</b><small class="catatan">Kamera atau galeri</small></span>') + '</label>' +
    (ada ? '<p class="catatan">Foto siap (' + ada.kb + ' KB), sudah diberi cap waktu' + (ada.koordinat ? ' &amp; koordinat' : '') + '. Ketuk foto untuk mengganti.</p>' : '') + '</div>';
}

function pasangFoto(id, saatSiap, label, lokasi) {
  var inp = document.getElementById(id); if (!inp) return;
  inp.onchange = function () {
    var berkas = inp.files && inp.files[0]; if (!berkas) return;
    toast('Memproses foto…');
    siapkanFoto(berkas, label, lokasi).then(saatSiap).catch(function (e) { toast(e.message); }).then(function () { inp.value = ''; });
  };
}

function ambilLokasi(saatDapat) {
  if (!navigator.geolocation) { toast('HP ini tidak mendukung lokasi.'); return; }
  toast('Mencari lokasi…');
  navigator.geolocation.getCurrentPosition(function (p) {
    saatDapat(p.coords.latitude.toFixed(6) + ', ' + p.coords.longitude.toFixed(6), Math.round(p.coords.accuracy));
  }, function (e) {
    toast(e.code === 1 ? 'Izin lokasi ditolak. Aktifkan di pengaturan browser.' : 'Lokasi belum didapat. Coba di tempat terbuka.');
  }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
}

/* ---------- Tampilan umum ---------- */
var waktuToast = null;
function toast(teks) {
  var t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = teks; t.hidden = false;
  clearTimeout(waktuToast); waktuToast = setTimeout(function () { t.hidden = true; }, 3200);
}

function htmlPesan() {
  if (!S.pesan) return '';
  return '<div class="pesan pesan-' + S.pesan.jenis + '" role="' + (S.pesan.jenis === 'galat' ? 'alert' : 'status') + '">' + esc(S.pesan.teks) + '</div>';
}

function gambar() {
  var akar = $('#aplikasi');
  if (!S.api) { akar.innerHTML = htmlAturApi(); pasangAturApi(); return; }
  if (!S.sesi || S.sesi.habis) { akar.innerHTML = htmlMasuk(); pasangMasuk(); return; }
  var jumlah = S.antrean.length;
  var py = S.sesi.pengguna || {};
  var info = S.mengirim ? 'Mengirim…' : (S.memuatData ? 'Memperbarui data…' : esc(py.nama || py.username || ''));
  akar.innerHTML =
    '<header class="kepala"><div class="kepala-isi"><img src="ikon-192.png" alt="">' +
    '<div class="kepala-judul"><b>MOTAHA Inspeksi</b><small>' + info + '</small></div>' +
    '<span class="jaringan' + (navigator.onLine ? '' : ' mati') + '">' + (navigator.onLine ? 'Online' : 'Offline') + '</span>' +
    '<button class="tombol-ikon" id="buka-menu" aria-label="Menu akun">' + IKON.menu + '</button></div></header>' +
    (S.pembaruan ? '<div class="pembaruan" role="status"><span>Versi baru <b>' + esc(S.pembaruan.versi) + '</b> tersedia.</span>' +
      '<a class="tombol tombol-kecil" href="' + esc(S.pembaruan.url) + '">Unduh</a></div>' : '') +
    '<main id="isi"></main>' +
    '<nav class="nav" aria-label="Menu utama"><div class="nav-isi">' +
    tombolNav('input', 'Temuan', IKON.input, 0) + tombolNav('tl', 'Tindak lanjut', IKON.tl, 0) + tombolNav('row', 'ROW', IKON.row, 0) +
    tombolNav('real', 'Realisasi', IKON.real, 0) +
    tombolNav('antre', 'Antrean', IKON.antre, jumlah) + '</div></nav>' +
    (S.lembar ? htmlMenu() : '');
  $('#buka-menu').onclick = function () { S.lembar = true; gambar(); };
  Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
    b.onclick = function () { simpanDrafSekarang(); S.tab = b.getAttribute('data-tab'); S.detail = null; S.detailReal = null; S.pesan = null; gambar(); window.scrollTo(0, 0); };
  });
  if (S.lembar) pasangMenu();
  var isi = $('#isi');
  if (!S.data) {
    isi.innerHTML = htmlPesan() + '<div class="panel"><p>' + (navigator.onLine ? '<span class="putar"></span> Mengambil daftar penyulang dan temuan…' :
      'Belum ada data form di HP ini. Sambungkan ke internet sekali untuk mengambil daftar penyulang, setelah itu form bisa dipakai tanpa sinyal.') + '</p></div>';
    return;
  }
  if (S.tab === 'input') gambarInput(isi);
  else if (S.tab === 'tl') gambarTindakLanjut(isi);
  else if (S.tab === 'row') gambarRowHp(isi);
  else if (S.tab === 'real') gambarRealisasiHp(isi);
  else gambarAntrean(isi);
}

function tombolNav(kunci, label, ikon, lencana) {
  return '<button data-tab="' + kunci + '"' + (S.tab === kunci ? ' aria-current="page"' : '') + '>' + ikon + label +
    (lencana ? '<span class="lencana" aria-label="' + lencana + ' belum terkirim">' + lencana + '</span>' : '') + '</button>';
}

function htmlMenu() {
  var py = S.sesi.pengguna || {};
  var dataInfo = S.data ? 'Data form: ' + jamTampil(S.data.diambil) : 'Data form belum ada';
  return '<div class="lembar-latar" id="latar"><div class="lembar" role="dialog" aria-label="Menu akun">' +
    '<b>' + esc(py.nama || py.username) + '</b><p class="catatan">' + esc(py.username) + ' · ' + esc(dataInfo) + ' · versi ' + VERSI_PWA + (DI_APK ? ' (APK)' : '') + '</p>' +
    '<button class="tombol" id="m-data">Perbarui daftar penyulang, temuan &amp; rencana ROW</button>' +
    (S.pasang ? '<button class="tombol" id="m-pasang">Pasang aplikasi di layar utama</button>' : '') +
    (DI_APK ? '<button class="tombol" id="m-cek">Cek pembaruan aplikasi</button>' : '') +
    '<button class="tombol" id="m-tema">Tema: ' + ({ light: 'Terang', dark: 'Gelap' }[bacaLokal(KUNCI.tema)] || 'Ikuti HP') + '</button>' +
    '<button class="tombol tombol-bahaya" id="m-keluar">Keluar</button>' +
    '<button class="tombol" id="m-tutup">Tutup</button></div></div>';
}

function pasangMenu() {
  var tutup = function () { S.lembar = false; gambar(); };
  $('#latar').onclick = function (e) { if (e.target.id === 'latar') tutup(); };
  $('#m-tutup').onclick = tutup;
  if ($('#m-cek')) $('#m-cek').onclick = function () { S.lembar = false; gambar(); cekPembaruan(true); };
  $('#m-data').onclick = function () { S.lembar = false; if (!navigator.onLine) { toast('Sedang offline.'); gambar(); return; } muatData(); };
  if ($('#m-pasang')) $('#m-pasang').onclick = function () { S.pasang.prompt(); S.pasang = null; tutup(); };
  $('#m-tema').onclick = function () {
    var urut = [null, 'light', 'dark'], kini = bacaLokal(KUNCI.tema), baru = urut[(urut.indexOf(kini) + 1) % 3];
    tulisLokal(KUNCI.tema, baru); terapkanTema(); gambar();
  };
  $('#m-keluar').onclick = function () {
    var n = S.antrean.length;
    if (!confirm(n ? 'Masih ada ' + n + ' data belum terkirim. Data itu tetap tersimpan di HP ini dan dikirim setelah ada yang masuk lagi. Keluar?' : 'Keluar dari aplikasi?')) return;
    if (navigator.onLine) panggil('logout', { token: S.sesi.token, kunciPerangkat: S.sesi.kunci }).catch(function () {});
    S.sesi = null; tulisLokal(KUNCI.sesi, null); S.lembar = false; gambar();
  };
}

function terapkanTema() {
  var t = bacaLokal(KUNCI.tema);
  if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
}

/* ---------- Atur alamat & masuk ---------- */
function htmlAturApi() {
  return '<div class="masuk">' + htmlLogo() + '<div class="panel"><h1>Hubungkan ke MOTAHA</h1>' +
    '<p class="sub">Tempel alamat Web App MOTAHA (dari admin). Alamatnya berakhiran <b>/exec</b>.</p>' +
    htmlPesan() + '<form id="f-api"><div class="medan"><label for="api">Alamat Web App</label>' +
    '<input id="api" type="url" inputmode="url" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" required></div>' +
    '<button class="tombol-utama" type="submit">Simpan</button></form></div></div>';
}
function pasangAturApi() {
  $('#f-api').onsubmit = function (e) {
    e.preventDefault();
    var v = $('#api').value.trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(v)) { S.pesan = { jenis: 'galat', teks: 'Alamat harus berbentuk https://script.google.com/macros/s/…/exec' }; gambar(); return; }
    S.api = v; tulisLokal(KUNCI.api, v); S.pesan = null; gambar();
  };
}

function htmlLogo() {
  return '<div class="masuk-logo"><img src="ikon-192.png" alt=""><div><b>MOTAHA</b><small>Inspeksi jaringan · PLN ULP Kolaka Utara</small></div></div>';
}

function htmlMasuk() {
  var habis = S.sesi && S.sesi.habis;
  return '<div class="masuk">' + htmlLogo() + '<div class="panel"><h1>Masuk</h1>' +
    '<p class="sub">Pakai akun MOTAHA yang sama dengan dashboard. Setelah masuk, aplikasi tetap bisa dipakai tanpa sinyal selama 30 hari.</p>' +
    (habis ? '<div class="pesan pesan-info">Masa masuk di HP ini sudah habis. Masuk lagi untuk melanjutkan' + (S.antrean.length ? ' — <b>' + S.antrean.length + ' data</b> di HP akan dikirim setelah masuk.' : '.') + '</div>' : '') +
    htmlPesan() +
    '<form id="f-masuk"><div class="medan"><label for="u">Username</label><input id="u" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" value="' + esc(habis && S.sesi.pengguna ? S.sesi.pengguna.username : '') + '" required></div>' +
    '<div class="medan"><label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required></div>' +
    '<button class="tombol-utama" type="submit" id="t-masuk">Masuk</button></form></div>' +
    (navigator.onLine ? '' : '<p class="catatan">Sedang offline — masuk butuh sinyal.</p>') +
    '<p class="catatan" style="margin-top:14px">Versi ' + VERSI_PWA + ' · <a href="#" id="ganti-api">Ganti alamat server</a></p></div>';
}

function pasangMasuk() {
  $('#ganti-api').onclick = function (e) {
    e.preventDefault();
    if (S.antrean.length && !confirm('Masih ada data belum terkirim. Tetap ganti alamat server?')) return;
    S.api = ''; tulisLokal(KUNCI.api, null); gambar();
  };
  $('#f-masuk').onsubmit = async function (e) {
    e.preventDefault();
    var tombol = $('#t-masuk'); tombol.disabled = true; tombol.innerHTML = '<span class="putar"></span> Masuk…';
    try {
      var j = await panggil('login', { username: $('#u').value.trim(), password: $('#p').value, perangkat: true });
      if (!j.ok) throw galat(j.error || 'Gagal masuk.');
      if (j.pengguna && j.pengguna.wajibGanti) throw galat('Akun ini wajib mengganti password dulu. Buka dashboard MOTAHA, ganti password, lalu masuk lagi di sini.');
      if (!j.kunciPerangkat) throw galat('Script MOTAHA di server belum diperbarui ke versi ' + VERSI_SERVER_MIN + '. Hubungi admin.');
      S.sesi = { token: j.token, kunci: j.kunciPerangkat, pengguna: j.pengguna };
      tulisLokal(KUNCI.sesi, S.sesi); S.pesan = null;
      if (S.draf && !S.draf.petugasInspeksi) S.draf.petugasInspeksi = j.pengguna.nama || '';
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
      gambar(); muatData(true); kirimAntrean();
    } catch (err) {
      var u = $('#u').value;
      S.pesan = { jenis: 'galat', teks: err.message }; gambar();
      $('#u').value = u; $('#p').focus();
    }
  };
}

/* ---------- Form input temuan ---------- */
/** Petugas eksekusi selalu = nama akun yang sedang masuk. */
function namaLogin() { var p = (S.sesi && S.sesi.pengguna) || {}; return p.nama || p.username || ''; }

function drafBaru(lama) {
  var py = (S.sesi && S.sesi.pengguna) || {};
  return {
    tanggal: hariIni(), penyulang: lama ? lama.penyulang : '', section: '', sectionManual: false,
    jenis: '', rencana: '', material: '', koordinat: '', keterangan: '', status: '',
    petugasInspeksi: lama ? lama.petugasInspeksi : (py.nama || ''), petugasEksekusi: namaLogin(), tanggalEksekusi: hariIni(),
    fotoTemuan: null, fotoEksekusi: null
  };
}

var tundaDraf = null;
function simpanDrafSekarang() {
  if (S.tab !== 'input' || !S.draf || !$('#f-ins')) return;
  ambilIsian();
  DB.taruh('draf', S.draf).catch(function () {});
}
function simpanDraf() { DB.taruh('draf', S.draf).catch(function () {}); } // tanpa membaca isian (state sudah diubah)
function simpanDrafNanti() { clearTimeout(tundaDraf); tundaDraf = setTimeout(simpanDrafSekarang, 400); }

function ambilIsian() {
  var f = S.draf, nilai = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : undefined; };
  var radio = function (n) { var el = document.querySelector('input[name="' + n + '"]:checked'); return el ? el.value : ''; };
  f.tanggal = nilai('i-tgl'); f.penyulang = nilai('i-py') || '';
  var sec = nilai('i-sec') || '';
  f.sectionManual = sec === '__lain';
  f.section = f.sectionManual ? (nilai('i-sec-lain') || '') : sec;
  f.jenis = radio('i-jenis'); f.rencana = radio('i-rencana'); f.material = radio('i-material'); f.status = radio('i-status');
  f.koordinat = nilai('i-koor') || ''; f.keterangan = nilai('i-ket') || ''; f.petugasInspeksi = nilai('i-pi') || '';
  if (document.getElementById('i-pe')) { f.petugasEksekusi = namaLogin(); f.tanggalEksekusi = nilai('i-tgl-eks'); }
  return f;
}

function radio(nama, daftar, pilih) {
  return '<div class="pilih-segmen" role="radiogroup">' + daftar.map(function (v) {
    return '<label><input type="radio" name="' + nama + '" value="' + esc(v) + '"' + (v === pilih ? ' checked' : '') + '><span>' + esc(v) + '</span></label>';
  }).join('') + '</div>';
}

function gambarInput(isi) {
  var d = S.data, p = d.pilihan, m = d.master || { penyulang: [], keypoint: {} }, f = S.draf;
  var daftarKp = (m.keypoint || {})[f.penyulang] || [];
  var manual = f.sectionManual || (f.section && daftarKp.indexOf(f.section) === -1);
  var opsi = function (v, pilih, label) { return '<option value="' + esc(v) + '"' + (v === pilih ? ' selected' : '') + '>' + esc(label || v) + '</option>'; };
  var daftarPy = m.penyulang.slice(); if (f.penyulang && daftarPy.indexOf(f.penyulang) === -1) daftarPy.push(f.penyulang);
  var sudah = f.status === p.status[1];
  isi.innerHTML = '<h1>' + (S.gantiAntre ? 'Perbaiki temuan' : 'Input temuan inspeksi') + '</h1>' +
    '<p class="sub">Tersimpan di HP dulu, lalu terkirim otomatis saat ada sinyal. <span class="wajib">*</span> wajib diisi.</p>' + htmlPesan() +
    (m.peringatan ? '<div class="pesan pesan-info">' + esc(m.peringatan) + '</div>' : '') +
    '<form id="f-ins" class="panel" novalidate>' +
    '<div class="medan"><label for="i-tgl">Tanggal inspeksi <span class="wajib">*</span></label><input id="i-tgl" type="date" max="' + hariIni() + '" value="' + esc(f.tanggal) + '"></div>' +
    '<div class="medan"><label for="i-py">Nama penyulang <span class="wajib">*</span></label><select id="i-py">' +
    opsi('', f.penyulang, '— Pilih penyulang —') + daftarPy.map(function (v) { return opsi(v, f.penyulang); }).join('') + '</select></div>' +
    '<div class="medan"><label for="i-sec">Nama section / segmen <span class="wajib">*</span></label><select id="i-sec"' + (f.penyulang ? '' : ' disabled') + '>' +
    opsi('', manual ? '__lain' : f.section, f.penyulang ? '— Pilih section / segmen (' + daftarKp.length + ') —' : '— Pilih penyulang dulu —') +
    daftarKp.map(function (v) { return opsi(v, manual ? '' : f.section); }).join('') +
    (f.penyulang ? opsi('__lain', manual ? '__lain' : '', 'Lainnya (ketik manual)…') : '') + '</select>' +
    (manual && f.penyulang ? '<input id="i-sec-lain" type="text" value="' + esc(f.section) + '" placeholder="Ketik nama section / segmen">' : '') + '</div>' +
    '<div class="medan"><span class="label">Jenis temuan <span class="wajib">*</span></span>' + radio('i-jenis', p.jenis, f.jenis) + '</div>' +
    '<div class="medan"><span class="label">Rencana tindak lanjut <span class="wajib">*</span></span>' + radio('i-rencana', p.rencana, f.rencana) + '</div>' +
    '<div class="medan"><span class="label">Kebutuhan material <span class="wajib">*</span></span>' + radio('i-material', p.material, f.material) + '</div>' +
    htmlFoto('i-foto', 'Foto temuan', true, f.fotoTemuan) +
    '<div class="medan"><label for="i-koor">Titik koordinat</label><div class="baris-isian"><input id="i-koor" type="text" inputmode="decimal" value="' + esc(f.koordinat) + '" placeholder="-3.123456, 121.123456">' +
    '<button class="tombol" type="button" id="i-gps">Lokasi saya</button></div><p class="catatan" id="i-koor-ket">Terisi otomatis dari foto bila kamera menyimpan lokasi.</p></div>' +
    '<div class="medan"><label for="i-ket">Keterangan</label><textarea id="i-ket" placeholder="Uraian temuan, lokasi detail, risiko…">' + esc(f.keterangan) + '</textarea></div>' +
    '<div class="medan"><label for="i-pi">Nama petugas inspeksi <span class="wajib">*</span></label><input id="i-pi" type="text" autocomplete="name" value="' + esc(f.petugasInspeksi) + '"></div>' +
    '<div class="medan"><span class="label">Status temuan <span class="wajib">*</span></span>' + radio('i-status', p.status, f.status || p.status[0]) + '</div>' +
    (sudah ? '<div class="blok-eksekusi"><p class="catatan" style="margin-bottom:10px"><b>Sudah eksekusi:</b> foto setelah eksekusi dan petugas eksekusi wajib diisi.</p>' +
      htmlFoto('i-foto2', 'Foto setelah eksekusi', true, f.fotoEksekusi) +
      htmlPetugasEksekusi('i-pe') +
      '<div class="medan"><label for="i-tgl-eks">Tanggal eksekusi</label><input id="i-tgl-eks" type="date" max="' + hariIni() + '" value="' + esc(f.tanggalEksekusi || hariIni()) + '"></div></div>' : '') +
    '<button class="tombol-utama" type="submit">' + (S.gantiAntre ? 'Simpan perbaikan' : 'Simpan temuan') + '</button>' +
    (S.gantiAntre ? '<button class="tombol" type="button" id="i-batal" style="width:100%;margin-top:8px">Batal</button>' : '') +
    '<button class="tombol tombol-kecil" type="button" id="i-kosong" style="width:100%;margin-top:8px">Kosongkan form</button>' +
    '</form>';
  pasangInput();
}

function pasangInput() {
  var f = S.draf, ulang = function () { ambilIsian(); simpanDrafSekarang(); gambar(); };
  $('#f-ins').addEventListener('input', simpanDrafNanti);
  $('#f-ins').addEventListener('change', simpanDrafNanti);
  $('#i-py').onchange = function () { ambilIsian(); f.section = ''; f.sectionManual = false; simpanDraf(); gambar(); };
  $('#i-sec').onchange = function () {
    var lain = $('#i-sec').value === '__lain'; ulang();
    if (lain && $('#i-sec-lain')) $('#i-sec-lain').focus();
  };
  Array.prototype.forEach.call(document.querySelectorAll('input[name="i-status"]'), function (el) { el.onchange = ulang; });
  pasangFoto('i-foto', function (foto) {
    ambilIsian(); f.fotoTemuan = foto;
    if (foto.koordinat && !f.koordinat) { f.koordinat = foto.koordinat; toast(foto.sumberKoordinat === 'foto' ? 'Koordinat diisi dari lokasi foto.' : 'Koordinat diisi dari GPS HP.'); }
    else if (!foto.koordinat) toast('Foto siap. Koordinat belum didapat — isi lewat Lokasi saya.');
    else toast('Foto siap (' + foto.kb + ' KB).');
    simpanDraf(); gambar();
  });
  pasangFoto('i-foto2', function (foto) { ambilIsian(); f.fotoEksekusi = foto; simpanDraf(); gambar(); });
  $('#i-gps').onclick = function () {
    ambilLokasi(function (k, akurasi) { ambilIsian(); f.koordinat = k; simpanDraf(); gambar(); toast('Lokasi didapat (±' + akurasi + ' m).'); });
  };
  $('#i-kosong').onclick = function () {
    if (!confirm('Kosongkan semua isian form?')) return;
    S.draf = drafBaru(); S.gantiAntre = null; DB.taruh('draf', S.draf).catch(function () {}); gambar();
  };
  if ($('#i-batal')) $('#i-batal').onclick = function () { S.gantiAntre = null; S.draf = drafBaru(); DB.taruh('draf', S.draf).catch(function () {}); S.tab = 'antre'; gambar(); };
  $('#f-ins').onsubmit = async function (e) {
    e.preventDefault();
    ambilIsian();
    var p = S.data.pilihan, sudah = f.status === p.status[1];
    var salah = !f.tanggal ? 'Tanggal inspeksi wajib diisi.' : f.tanggal > hariIni() ? 'Tanggal inspeksi tidak boleh di masa depan.' :
      !f.penyulang ? 'Pilih nama penyulang.' : !f.section ? 'Nama section/segmen wajib diisi.' :
      !f.jenis ? 'Pilih jenis temuan.' : !f.rencana ? 'Pilih rencana tindak lanjut.' : !f.material ? 'Pilih kebutuhan material.' :
      !f.fotoTemuan ? 'Foto temuan wajib dilampirkan.' : f.koordinat && !koordinatSah(f.koordinat) ? 'Titik koordinat tidak sah (contoh: -3.123456, 121.123456).' :
      !f.petugasInspeksi ? 'Nama petugas inspeksi wajib diisi.' : !f.status ? 'Pilih status temuan.' :
      sudah && !f.fotoEksekusi ? 'Foto setelah eksekusi wajib dilampirkan.' : sudah && !namaLogin() ? 'Nama akun tidak terbaca — keluar lalu masuk lagi.' :
      sudah && f.tanggalEksekusi && f.tanggalEksekusi < f.tanggal ? 'Tanggal eksekusi tidak boleh sebelum tanggal inspeksi.' : '';
    if (salah) { S.pesan = { jenis: 'galat', teks: salah }; gambar(); window.scrollTo(0, 0); return; }
    var lama = S.gantiAntre && S.antrean.filter(function (x) { return x.idAntre === S.gantiAntre; })[0];
    var idKlien = lama && lama.muatan.tanggal === f.tanggal ? lama.idAntre : 'INS-' + f.tanggal.replace(/-/g, '') + '-' + hex(4);
    var item = {
      idAntre: idKlien, aksi: 'simpanInspeksi', dibuat: lama ? lama.dibuat : new Date().toISOString(), status: 'menunggu', pesan: '', percobaan: 0,
      ringkasan: { judul: f.penyulang + ' · ' + f.section, sub: f.jenis + ' · ' + f.status, tanggal: f.tanggal },
      muatan: {
        idKlien: idKlien, tanggal: f.tanggal, penyulang: f.penyulang, section: f.section, jenis: f.jenis, rencana: f.rencana, material: f.material,
        koordinat: f.koordinat, keterangan: f.keterangan, status: f.status, petugasInspeksi: f.petugasInspeksi,
        fotoTemuan: { mime: f.fotoTemuan.mime, data: f.fotoTemuan.data },
        fotoEksekusi: sudah ? { mime: f.fotoEksekusi.mime, data: f.fotoEksekusi.data } : null,
        petugasEksekusi: sudah ? namaLogin() : '', tanggalEksekusi: sudah ? (f.tanggalEksekusi || hariIni()) : ''
      }
    };
    try {
      if (lama && lama.idAntre !== idKlien) await DB.hapus(lama.idAntre);
      await DB.simpan(item);
    } catch (err) { S.pesan = { jenis: 'galat', teks: 'Gagal menyimpan di HP: ' + err.message }; gambar(); return; }
    S.draf = drafBaru(f); S.gantiAntre = null; DB.taruh('draf', S.draf).catch(function () {});
    await muatAntrean();
    S.pesan = { jenis: 'ok', teks: navigator.onLine ? 'Temuan tersimpan dan sedang dikirim.' : 'Temuan tersimpan di HP. Akan dikirim otomatis saat ada sinyal.' };
    gambar(); window.scrollTo(0, 0);
    kirimAntrean();
  };
}

/* ---------- Tindak lanjut ---------- */
function daftarTemuan() {
  // Temuan terbuka dari server + temuan baru di antrean yang belum terkirim (status Belum Eksekusi).
  var belumEks = S.data.pilihan.status[0];
  var lokal = S.antrean.filter(function (x) { return x.aksi === 'simpanInspeksi' && x.muatan.status === belumEks; }).map(function (x) {
    var m = x.muatan;
    return { 'ID': x.idAntre, 'TANGGAL INSPEKSI': m.tanggal, 'PENYULANG': m.penyulang, 'SECTION/SEGMEN': m.section, 'JENIS TEMUAN': m.jenis,
      'RENCANA TINDAK LANJUT': m.rencana, 'KEBUTUHAN MATERIAL': m.material, 'KOORDINAT': m.koordinat, 'KETERANGAN': m.keterangan,
      'PETUGAS INSPEKSI': m.petugasInspeksi, _lokal: true };
  });
  var ada = {}; lokal.forEach(function (x) { ada[x.ID] = true; });
  return lokal.concat((S.data.terbuka || []).filter(function (x) { return !ada[x.ID]; }));
}

function eksekusiTertunda(id) { return S.antrean.filter(function (x) { return x.aksi === 'eksekusiInspeksi' && x.muatan.id === id; })[0]; }

function htmlPetugasEksekusi(id) {
  return '<div class="medan"><label for="' + id + '">Nama petugas eksekusi</label><input id="' + id + '" type="text" value="' + esc(namaLogin()) + '" readonly aria-readonly="true">' +
    '<p class="catatan">Otomatis sesuai akun yang masuk.</p></div>';
}

function cocokCari(x) {
  if (S.saringPy && x['PENYULANG'] !== S.saringPy) return false;
  var q = S.cari.toUpperCase();
  if (!q) return true;
  return [x.ID, x['PENYULANG'], x['SECTION/SEGMEN'], x['KETERANGAN'], x['JENIS TEMUAN'], x['PETUGAS INSPEKSI'], x['PETUGAS EKSEKUSI']]
    .join(' ').toUpperCase().indexOf(q) !== -1;
}

function gambarTindakLanjut(isi) {
  if (S.detail) { gambarDetail(isi); return; }
  var selesaiMode = S.tlMode === 'selesai';
  var belum = daftarTemuan(), selesai = S.data.selesai || [];
  var semua = selesaiMode ? selesai : belum;
  var py = {}; semua.forEach(function (x) { py[x['PENYULANG']] = (py[x['PENYULANG']] || 0) + 1; });
  if (S.saringPy && !py[S.saringPy]) S.saringPy = '';
  var tampil = semua.filter(cocokCari);
  var nSelesai = S.data.jumlahSelesai !== undefined ? S.data.jumlahSelesai : selesai.length;
  isi.innerHTML = '<h1>Tindak lanjut</h1><p class="sub">' + belum.length + ' belum dieksekusi · ' + nSelesai + ' selesai' +
    (S.data.diambil ? ' · data ' + esc(jamTampil(S.data.diambil)) : '') + '</p>' + htmlPesan() +
    '<div class="segmen" role="tablist">' +
    '<button role="tab" data-tl="belum" aria-selected="' + !selesaiMode + '">Belum eksekusi <b>' + belum.length + '</b></button>' +
    '<button role="tab" data-tl="selesai" aria-selected="' + selesaiMode + '">Selesai <b>' + nSelesai + '</b></button></div>' +
    '<div class="alat"><input id="t-cari" type="text" placeholder="Cari…" value="' + esc(S.cari) + '" aria-label="Cari temuan">' +
    '<select id="t-py" aria-label="Saring penyulang"><option value="">Semua penyulang</option>' +
    Object.keys(py).sort().map(function (k) { return '<option value="' + esc(k) + '"' + (k === S.saringPy ? ' selected' : '') + '>' + esc(k) + ' (' + py[k] + ')</option>'; }).join('') +
    '</select></div>' +
    (selesaiMode && S.data.selesai === undefined ? '<div class="pesan pesan-info">Daftar temuan selesai butuh script MOTAHA versi terbaru di server. Hubungi admin.</div>' : '') +
    (tampil.length ? tampil.map(function (x, i) { return selesaiMode ? kartuSelesai(x, i) : kartuBelum(x, i); }).join('') :
      '<div class="kosong-daftar">' + (semua.length ? 'Tidak ada yang cocok.' : selesaiMode ? 'Belum ada temuan yang selesai.' : 'Tidak ada temuan yang menunggu eksekusi.') + '</div>') +
    (selesaiMode && nSelesai > selesai.length ? '<p class="catatan" style="text-align:center">Menampilkan ' + selesai.length + ' temuan selesai terbaru dari ' + nSelesai + '. Selengkapnya di dashboard MOTAHA.</p>' : '');
  Array.prototype.forEach.call(document.querySelectorAll('[data-tl]'), function (b) {
    b.onclick = function () { S.tlMode = b.getAttribute('data-tl'); S.saringPy = ''; gambar(); };
  });
  var tunda = null;
  $('#t-cari').oninput = function (e) {
    clearTimeout(tunda);
    tunda = setTimeout(function () { S.cari = e.target.value; gambar(); var c = $('#t-cari'); c.focus(); c.setSelectionRange(c.value.length, c.value.length); }, 250);
  };
  $('#t-py').onchange = function (e) { S.saringPy = e.target.value; gambar(); };
  Array.prototype.forEach.call(document.querySelectorAll('.kartu[data-i]'), function (b) {
    b.onclick = function () {
      var x = tampil[+b.getAttribute('data-i')];
      S.detail = x.ID; S.detailSelesai = selesaiMode; S.eks = { foto: null, tanggal: hariIni() }; S.pesan = null; gambar(); window.scrollTo(0, 0);
    };
  });
}

function kartuBelum(x, i) {
  var tunda = eksekusiTertunda(x.ID);
  return '<button class="kartu" data-i="' + i + '"><div class="kartu-atas"><span>' + esc(tglTampil(x['TANGGAL INSPEKSI'])) + '</span><span>' + esc(x.ID) + '</span></div>' +
    '<div class="kartu-judul">' + esc(x['PENYULANG']) + ' · ' + esc(x['SECTION/SEGMEN']) + '</div>' +
    (x['KETERANGAN'] ? '<div class="kartu-ket">' + esc(x['KETERANGAN']) + '</div>' : '') +
    '<div class="tags">' + (tunda ? '<span class="tag tag-tunggu">Eksekusi menunggu kirim</span>' : '<span class="tag tag-belum">Belum eksekusi</span>') +
    '<span class="tag">' + esc(x['JENIS TEMUAN']) + '</span>' +
    (/butuh padam/i.test(x['RENCANA TINDAK LANJUT']) ? '<span class="tag">Butuh padam</span>' : '') +
    (/^butuh material/i.test(x['KEBUTUHAN MATERIAL']) ? '<span class="tag">Butuh material</span>' : '') +
    (x._lokal ? '<span class="tag tag-tunggu">Belum terkirim</span>' : '') + '</div></button>';
}

function kartuSelesai(x, i) {
  return '<button class="kartu" data-i="' + i + '"><div class="kartu-atas"><span>Selesai ' + esc(tglTampil(x['TANGGAL EKSEKUSI'])) + '</span><span>' + esc(x.ID) + '</span></div>' +
    '<div class="kartu-judul">' + esc(x['PENYULANG']) + ' · ' + esc(x['SECTION/SEGMEN']) + '</div>' +
    (x['KETERANGAN'] ? '<div class="kartu-ket">' + esc(x['KETERANGAN']) + '</div>' : '') +
    '<div class="tags"><span class="tag tag-sudah">Sudah eksekusi</span><span class="tag">' + esc(x['JENIS TEMUAN']) + '</span>' +
    (x['PETUGAS EKSEKUSI'] ? '<span class="tag">' + esc(x['PETUGAS EKSEKUSI']) + '</span>' : '') + '</div></button>';
}

/** Kotak foto dari Drive (lewat server, hanya saat online); disimpan sementara di memori. */
function htmlFotoServer(id, label) {
  if (!id) return '';
  var ada = S.foto[id];
  return '<div class="medan"><span class="label">' + label + '</span>' +
    (ada && ada.data ? '<img class="foto-server" src="' + ada.data + '" alt="' + esc(label) + '">' :
      '<button class="tombol" type="button" data-foto="' + esc(id) + '"' + (ada && ada.memuat ? ' disabled' : '') + '>' +
      (ada && ada.memuat ? '<span class="putar"></span> Memuat foto…' : ada && ada.galat ? 'Coba lagi — ' + esc(ada.galat) : 'Lihat foto') + '</button>') + '</div>';
}

function pasangFotoServer() {
  Array.prototype.forEach.call(document.querySelectorAll('[data-foto]'), function (b) {
    b.onclick = async function () {
      var id = b.getAttribute('data-foto');
      if (!navigator.onLine) { toast('Foto hanya bisa dilihat saat ada sinyal.'); return; }
      S.foto[id] = { memuat: true }; gambar();
      try { var f = await api('fotoInspeksi', { fileId: id }); S.foto[id] = { data: 'data:' + f.mime + ';base64,' + f.data }; }
      catch (e) { S.foto[id] = { galat: e.message }; }
      gambar();
    };
  });
}

function gambarDetail(isi) {
  var sumber = S.detailSelesai ? (S.data.selesai || []) : daftarTemuan();
  var x = sumber.filter(function (t) { return t.ID === S.detail; })[0];
  if (!x) { S.detail = null; gambar(); return; }
  var tunda = !S.detailSelesai && eksekusiTertunda(x.ID), e = S.eks || (S.eks = { foto: null, tanggal: hariIni() });
  var baris = function (k, v) { return v ? '<dt>' + k + '</dt><dd>' + v + '</dd>' : ''; };
  isi.innerHTML = '<button class="kembali" id="d-kembali">‹ Kembali ke daftar</button>' + htmlPesan() +
    '<div class="panel"><div class="kartu-atas"><span>' + esc(x.ID) + '</span>' +
    (x._lokal ? '<span class="tag tag-tunggu">Belum terkirim</span>' : S.detailSelesai ? '<span class="tag tag-sudah">Sudah eksekusi</span>' : '<span class="tag tag-belum">Belum eksekusi</span>') + '</div>' +
    '<h1 style="margin:6px 0 12px">' + esc(x['PENYULANG']) + ' · ' + esc(x['SECTION/SEGMEN']) + '</h1><dl class="rinci">' +
    baris('Tanggal inspeksi', esc(tglTampil(x['TANGGAL INSPEKSI']))) + baris('Jenis temuan', esc(x['JENIS TEMUAN'])) +
    baris('Rencana', esc(x['RENCANA TINDAK LANJUT'])) + baris('Material', esc(x['KEBUTUHAN MATERIAL'])) +
    baris('Petugas inspeksi', esc(x['PETUGAS INSPEKSI'])) + baris('Keterangan', esc(x['KETERANGAN'])) +
    baris('Koordinat', x['KOORDINAT'] ? esc(x['KOORDINAT']) + ' · <a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(x['KOORDINAT']) + '">Petunjuk arah ↗</a>' : '') +
    (S.detailSelesai ? baris('Tanggal eksekusi', esc(tglTampil(x['TANGGAL EKSEKUSI']))) + baris('Petugas eksekusi', esc(x['PETUGAS EKSEKUSI'])) : '') +
    '</dl>' + (x._lokal ? '' : htmlFotoServer(x._fotoTemuan, 'Foto temuan') + (S.detailSelesai ? htmlFotoServer(x._fotoEksekusi, 'Foto setelah eksekusi') : '')) + '</div>' +
    (S.detailSelesai ? '' : tunda ? '<div class="pesan pesan-info">Eksekusi oleh <b>' + esc(tunda.muatan.petugasEksekusi) + '</b> (' + esc(tglTampil(tunda.muatan.tanggalEksekusi)) + ') sudah tersimpan di HP dan menunggu dikirim.</div>' :
      '<form id="f-eks" class="panel" novalidate><h1 style="font-size:17px">Tandai sudah eksekusi</h1><p class="sub">Tersimpan di HP dulu, lalu terkirim saat ada sinyal.</p>' +
      htmlFoto('e-foto', 'Foto setelah eksekusi', true, e.foto) + htmlPetugasEksekusi('e-pe') +
      '<div class="medan"><label for="e-tgl">Tanggal eksekusi <span class="wajib">*</span></label><input id="e-tgl" type="date" min="' + esc(x['TANGGAL INSPEKSI']) + '" max="' + hariIni() + '" value="' + esc(e.tanggal) + '"></div>' +
      '<button class="tombol-utama" type="submit">Simpan eksekusi</button></form>');
  $('#d-kembali').onclick = function () { S.detail = null; S.pesan = null; gambar(); };
  pasangFotoServer();
  if (S.detailSelesai || tunda) return;
  var ambil = function () { e.tanggal = $('#e-tgl').value; };
  pasangFoto('e-foto', function (foto) { ambil(); e.foto = foto; gambar(); });
  $('#f-eks').onsubmit = async function (ev) {
    ev.preventDefault(); ambil();
    var petugas = namaLogin();
    var salah = !e.foto ? 'Foto setelah eksekusi wajib dilampirkan.' : !petugas ? 'Nama akun tidak terbaca — keluar lalu masuk lagi.' :
      !e.tanggal ? 'Tanggal eksekusi wajib diisi.' : e.tanggal < x['TANGGAL INSPEKSI'] ? 'Tanggal eksekusi tidak boleh sebelum tanggal inspeksi.' :
      e.tanggal > hariIni() ? 'Tanggal eksekusi tidak boleh di masa depan.' : '';
    if (salah) { S.pesan = { jenis: 'galat', teks: salah }; gambar(); window.scrollTo(0, 0); return; }
    var item = {
      idAntre: 'EKS-' + x.ID, aksi: 'eksekusiInspeksi', dibuat: new Date().toISOString(), status: 'menunggu', pesan: '', percobaan: 0,
      ringkasan: { judul: 'Eksekusi ' + x['PENYULANG'] + ' · ' + x['SECTION/SEGMEN'], sub: x.ID + ' · ' + petugas, tanggal: e.tanggal },
      muatan: { id: x.ID, fotoEksekusi: { mime: e.foto.mime, data: e.foto.data }, petugasEksekusi: petugas, tanggalEksekusi: e.tanggal }
    };
    try { await DB.simpan(item); } catch (err) { S.pesan = { jenis: 'galat', teks: 'Gagal menyimpan di HP: ' + err.message }; gambar(); return; }
    await muatAntrean();
    S.detail = null; S.eks = null;
    S.pesan = { jenis: 'ok', teks: navigator.onLine ? 'Eksekusi tersimpan dan sedang dikirim.' : 'Eksekusi tersimpan di HP. Akan dikirim otomatis saat ada sinyal.' };
    gambar(); window.scrollTo(0, 0); kirimAntrean();
  };
}

/* ---------- ROW: WO (rencana) → Mulai · Istirahat · Mulai lagi · Selesai, temuan & realisasi ----------
 * Alur: pilih WO hari ini → Mulai (konfirmasi kehadiran; yang tidak hadir wajib diberi alasan) → temuan inspeksi
 * ROW di penyulang & section WO muncul → input realisasi (dari temuan atau di luar temuan) → Istirahat / Mulai lagi
 * → Selesai (jumlah gawang). Satu regu hanya boleh punya satu WO berjalan; WO lain terkunci sampai Selesai.
 */
var LABEL_ABSEN = { MULAI: 'Mulai', ISTIRAHAT: 'Istirahat', LANJUT: 'Mulai lagi', SELESAI: 'Selesai' };
var LABEL_STATUS_WO = { belum: 'Belum mulai', berjalan: 'Sedang dikerjakan', istirahat: 'Istirahat', selesai: 'Selesai' };

function waktuLokal(d) {
  d = d || new Date();
  var dua = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + dua(d.getMonth() + 1) + '-' + dua(d.getDate()) + ' ' + dua(d.getHours()) + ':' + dua(d.getMinutes()) + ':' + dua(d.getSeconds());
}
function daftarRegu() { return ((S.dataRow && S.dataRow.regu) || []).filter(function (r) { return r.aktif !== false; }); }
function dataRegu(nama) {
  var n = String(nama || '').toUpperCase().trim();
  return daftarRegu().filter(function (r) { return String(r.nama).toUpperCase().trim() === n; })[0] || null;
}
function meterGawang() { return (S.dataRow && S.dataRow.pilihan && S.dataRow.pilihan.meterPerGawang) || 50; }
function alasanTidakHadir() { return (S.dataRow && S.dataRow.pilihan && S.dataRow.pilihan.alasanTidakHadir) || ['Sakit', 'Izin', 'Tidak ada informasi']; }
function angkaId(n, d) { return Number(n).toLocaleString('id-ID', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
function apakahTebang(jenis) { return ((S.dataRow && S.dataRow.pilihan.pengukuran) || []).indexOf(jenis) !== -1; }
function jamDari(w) { return String(w || '').slice(11, 16); }

function drafRowBaru(idRencana, mode, idTemuan) {
  return { idRencana: idRencana || '', mode: mode || '', idTemuan: idTemuan ? [idTemuan] : [], jenis: '',
    koordinat: '', keterangan: '', fotoSebelum: null, fotoSesudah: null, fotoPengukuran: null };
}
function simpanDrafRow() { DB.taruh('drafRow', S.drafRow).catch(function () {}); }

function cariWo(id) { return ((S.dataRow && S.dataRow.rencana) || []).filter(function (r) { return r.ID === id; })[0] || null; }
function woHariIni() {
  var t = hariIni();
  return ((S.dataRow && S.dataRow.rencana) || []).filter(function (r) { return r.TANGGAL === t; })
    .sort(function (a, b) { return (a.REGU + a.PENYULANG + a['SECTION/SEGMEN']) < (b.REGU + b.PENYULANG + b['SECTION/SEGMEN']) ? -1 : 1; });
}
function aktif(x) { return x.status !== 'ditolak'; }

/** Semua catatan Mulai/Istirahat/Mulai lagi/Selesai: dari server + antrean HP (yang ditolak server tidak ikut). */
function absenSemua() {
  return ((S.dataRow && S.dataRow.absen) || []).filter(function (a) { return a['ID RENCANA']; }).map(function (a) {
    return { id: String(a.ID).toUpperCase(), idRencana: a['ID RENCANA'], jenis: a.JENIS, waktu: a.WAKTU, regu: a.REGU, gawang: a.GAWANG, hadir: a.HADIR, tidakHadir: a['TIDAK HADIR'] };
  }).concat(S.antrean.filter(function (x) { return x.aksi === 'absenRow' && aktif(x) && x.muatan.idRencana; }).map(function (x) {
    var m = x.muatan;
    return { id: String(m.idKlien).toUpperCase(), idRencana: m.idRencana, jenis: m.jenis, waktu: m.waktu, regu: m.regu, gawang: m.gawang, antre: true,
      hadir: (m.hadir || []).join(', '), tidakHadir: (m.tidakHadir || []).map(function (t) { return t.nama + ' (' + t.alasan + ')'; }).join(', ') };
  }));
}

/** Status WO: {status, catatan:[urut waktu], mulai, selesai, gawang}. */
function statusWo(id, semua) {
  var catatan = (semua || absenSemua()).filter(function (a) { return a.idRencana === id; });
  var ada = {}; catatan = catatan.filter(function (a) { if (ada[a.id]) return false; ada[a.id] = 1; return true; });
  catatan.sort(function (a, b) { return String(a.waktu) < String(b.waktu) ? -1 : String(a.waktu) > String(b.waktu) ? 1 : 0; });
  var st = 'belum', hasil = { mulai: null, selesai: null, gawang: '' };
  catatan.forEach(function (a) {
    if (st === 'selesai') return;
    if (a.jenis === 'MULAI' && !hasil.mulai) hasil.mulai = a;
    st = a.jenis === 'MULAI' || a.jenis === 'LANJUT' ? 'berjalan' : a.jenis === 'ISTIRAHAT' ? 'istirahat' : a.jenis === 'SELESAI' ? 'selesai' : st;
    if (a.jenis === 'SELESAI') { hasil.selesai = a; hasil.gawang = a.gawang; }
  });
  hasil.status = st; hasil.catatan = catatan;
  return hasil;
}

/** WO lain milik regu yang sama (hari ini) yang sedang berjalan / istirahat — mengunci WO lain. */
function woBerjalanRegu(regu, kecuali) {
  var semua = absenSemua(), n = String(regu || '').toUpperCase().trim();
  return woHariIni().filter(function (r) {
    if (r.ID === kecuali || String(r.REGU).toUpperCase().trim() !== n) return false;
    var s = statusWo(r.ID, semua).status; return s === 'berjalan' || s === 'istirahat';
  })[0] || null;
}

/** Realisasi satu WO: dari server + antrean (yang ditolak tidak ikut), berurut waktu. */
function realisasiWo(id) {
  var ada = {};
  var antre = S.antrean.filter(function (x) { return x.aksi === 'simpanRealisasiRow' && aktif(x) && x.muatan.idRencana === id; }).map(function (x) {
    var m = x.muatan; ada[String(m.idKlien).toUpperCase()] = 1;
    return { id: m.idKlien, jenis: m.jenis, waktu: m.waktu, koordinat: m.koordinat, keterangan: m.keterangan, idTemuan: (m.idTemuan || []).join(', '), antre: true };
  });
  var server = ((S.dataRow && S.dataRow.realisasi) || []).filter(function (x) { return x['ID RENCANA'] === id && !ada[String(x.ID).toUpperCase()]; }).map(function (x) {
    return { id: x.ID, jenis: x['JENIS PEKERJAAN'], waktu: x.WAKTU, koordinat: x.KOORDINAT, keterangan: x.KETERANGAN, idTemuan: x['ID TEMUAN'],
      fotoSebelum: x.fotoSebelum, fotoSesudah: x.fotoSesudah, fotoUkur: x.fotoUkur, petugas: x.PETUGAS };
  });
  return server.concat(antre).sort(function (a, b) { return String(a.waktu) < String(b.waktu) ? -1 : 1; });
}

/**
 * Temuan inspeksi berjenis ROW yang belum dieksekusi pada penyulang (& section bila diisi) — dari data HP.
 * Temuan yang eksekusinya / realisasi penutupnya masih di antrean tidak ikut.
 */
function temuanRowTerbuka(penyulang, section) {
  if (!S.data || !penyulang) return [];
  var baku = function (t) { return String(t || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim(); };
  var diantre = {};
  S.antrean.forEach(function (x) {
    if (!aktif(x)) return;
    if (x.aksi === 'eksekusiInspeksi') diantre[x.muatan.id] = 1;
    if (x.aksi === 'simpanRealisasiRow') (x.muatan.idTemuan || []).forEach(function (id) { diantre[id] = 1; });
  });
  return daftarTemuan().filter(function (t) {
    return !t._lokal && !diantre[t.ID] && baku(t['JENIS TEMUAN']) === 'ROW' && baku(t['PENYULANG']) === baku(penyulang) &&
      (!section || baku(t['SECTION/SEGMEN']) === baku(section));
  });
}
function cariTemuan(id) { return daftarTemuan().filter(function (t) { return t.ID === id; })[0] || null; }

function teksTarget(r) {
  var tk = r['TARGET PEMANGKASAN (KMS)'], tb = r['TARGET PENEBANGAN (BTG)'];
  return [tk ? 'Pangkas ' + angkaId(tk, 2) + ' kms' : '', tb ? 'Tebang ' + tb + ' btg' : ''].filter(Boolean).join(' · ') || r['JENIS PEKERJAAN'] || '';
}
function tagStatusWo(st) {
  var kelas = { belum: 'tag-belum', berjalan: 'tag-jalan', istirahat: 'tag-tunggu', selesai: 'tag-sudah' }[st];
  return '<span class="tag ' + kelas + '">' + LABEL_STATUS_WO[st] + '</span>';
}
function htmlLini(catatan) {
  if (!catatan.length) return '';
  return '<div class="lini-wo">' + catatan.map(function (a) {
    return '<span class="lini-' + a.jenis.toLowerCase() + '"><small>' + LABEL_ABSEN[a.jenis] + '</small><b>' + jamDari(a.waktu) + '</b>' + (a.antre ? '<em>antre</em>' : '') + '</span>';
  }).join('') + '</div>';
}

/** Ringkasan realisasi satu WO (form Selesai, WO selesai, menu Realisasi). gawang: angka atau '' (belum diisi). */
function htmlRingkasWo(wo, gawang, judul) {
  var rr = realisasiWo(wo.ID), nTebang = rr.filter(function (x) { return apakahTebang(x.jenis); }).length, nPangkas = rr.length - nTebang;
  var nTemuan = rr.reduce(function (a, x) { return a + (x.idTemuan ? String(x.idTemuan).split(',').filter(function (s) { return s.trim(); }).length : 0); }, 0);
  var tKms = +wo['TARGET PEMANGKASAN (KMS)'] || 0, tBtg = +wo['TARGET PENEBANGAN (BTG)'] || 0;
  var adaG = gawang !== '' && gawang !== null && gawang !== undefined && isFinite(+gawang), kms = adaG ? +gawang * meterGawang() / 1000 : null;
  var persen = function (n, t) { return t ? ' (' + Math.round(n / t * 100) + '%)' : ''; };
  return '<div class="ringkas-realisasi"><b>' + esc(judul) + '</b><div class="rr-angka">' +
    '<div><small>Pemangkasan</small><b>' + (kms === null ? '—' : angkaId(kms, 2) + ' kms') + '</b><small>' + (kms === null ? 'isi jumlah gawang' : angkaId(+gawang) + ' gawang') +
    (tKms ? ' · target ' + angkaId(tKms, 2) + ' kms' + (kms === null ? '' : persen(kms, tKms)) : '') + '</small></div>' +
    '<div><small>Penebangan</small><b>' + nTebang + ' btg</b><small>' + (tBtg ? 'target ' + tBtg + ' btg' + persen(nTebang, tBtg) : 'tanpa target') + '</small></div>' +
    '<div><small>Titik pangkas</small><b>' + nPangkas + '</b><small>' + nTemuan + ' temuan ditutup</small></div></div>' +
    (rr.some(function (x) { return x.antre; }) ? '<p class="catatan">Sebagian realisasi masih di antrean HP — ikut dihitung.</p>' : '') + '</div>';
}

function htmlTitikRealisasi(rr, foto) {
  if (!rr.length) return '<div class="kosong-daftar">Belum ada realisasi.</div>';
  return rr.map(function (x, i) {
    return '<div class="kartu titik-row"><div class="kartu-judul">' + (i + 1) + '. ' + esc(x.jenis) + ' · ' + esc(jamDari(x.waktu)) + '</div>' +
      (x.idTemuan ? '<div class="kartu-ket">✅ Menutup temuan ' + esc(x.idTemuan) + '</div>' : '<div class="kartu-ket">Di luar temuan inspeksi</div>') +
      (x.koordinat ? '<div class="kartu-ket">📍 ' + esc(x.koordinat) + '</div>' : '') + (x.keterangan ? '<div class="kartu-ket">' + esc(x.keterangan) + '</div>' : '') +
      (x.antre ? '<div class="tags"><span class="tag tag-tunggu">Belum terkirim</span></div>' :
        foto ? '<div class="foto-titik">' + htmlFotoServer(x.fotoSebelum, 'Sebelum') + htmlFotoServer(x.fotoSesudah, 'Sesudah') + (x.fotoUkur ? htmlFotoServer(x.fotoUkur, 'Pengukuran batang') : '') + '</div>' : '') +
      '</div>';
  }).join('');
}

/* ----- Tampilan menu ROW ----- */
function gambarRowHp(isi) {
  var d = S.dataRow;
  if (!d) {
    isi.innerHTML = '<h1>ROW</h1>' + htmlPesan() + '<div class="panel"><p>' + (S.pesanRow ? esc(S.pesanRow) : navigator.onLine ? '<span class="putar"></span> Mengambil rencana ROW…' :
      'Data ROW belum ada di HP ini. Sambungkan ke internet sekali.') + '</p></div>';
    return;
  }
  if (!d.pilihan || !d.pilihan.alasanTidakHadir) {
    isi.innerHTML = '<h1>ROW</h1><div class="panel"><p class="pesan pesan-galat">Script MOTAHA di server belum diperbarui ke versi ' + VERSI_SERVER_MIN +
      '. Hubungi admin, lalu buka menu akun → Perbarui data.</p></div>';
    return;
  }
  var wo = S.wo ? cariWo(S.wo) : null;
  if (S.wo && !wo) { S.wo = null; tulisLokal(KUNCI.wo, null); }
  if (wo && S.formRow) gambarFormRealisasi(isi, wo);
  else if (wo) gambarDetailWo(isi, wo);
  else gambarDaftarWo(isi);
  pasangFotoServer();
}

function gambarDaftarWo(isi) {
  var daftar = woHariIni(), semua = absenSemua();
  isi.innerHTML = '<h1>ROW · ' + esc(tglTampil(hariIni())) + '</h1>' +
    '<p class="sub">Pilih WO (rencana kerja hari ini) yang akan dikerjakan.</p>' + htmlPesan() +
    '<h2 class="judul-bagian">Rencana hari ini (' + daftar.length + ' WO)</h2>' +
    (daftar.length ? daftar.map(function (r) {
      var s = statusWo(r.ID, semua), nT = temuanRowTerbuka(r.PENYULANG, r['SECTION/SEGMEN']).length, rg = dataRegu(r.REGU);
      var kunci = s.status === 'belum' ? woBerjalanRegu(r.REGU, r.ID) : null;
      return '<button type="button" class="kartu kartu-rencana kartu-wo st-' + s.status + '" data-wo="' + esc(r.ID) + '">' +
        '<div class="kartu-judul">' + esc(r.PENYULANG + ' · ' + r['SECTION/SEGMEN']) + '</div>' +
        '<div class="kartu-ket">' + esc(teksTarget(r)) + '</div>' +
        '<div class="kartu-ket">' + esc(r.REGU + (rg ? ' · ' + rg.vendor : '')) + '</div>' +
        '<div class="tags">' + tagStatusWo(s.status) + (nT && s.status !== 'selesai' ? '<span class="tag tag-belum">' + nT + ' temuan ROW</span>' : '') +
        (kunci ? '<span class="tag">🔒 Tunggu WO ' + esc(kunci['SECTION/SEGMEN']) + ' selesai</span>' : '') + '</div></button>';
    }).join('') : '<div class="kosong-daftar">Belum ada WO yang dijadwalkan hari ini. Admin membuatnya di dashboard (Monitoring ROW → + Rencana ROW).</div>');
  Array.prototype.forEach.call(document.querySelectorAll('[data-wo]'), function (b) {
    b.onclick = function () { S.wo = b.getAttribute('data-wo'); tulisLokal(KUNCI.wo, S.wo); S.absenForm = null; S.formRow = false; S.pesan = null; gambar(); window.scrollTo(0, 0); };
  });
}

function gambarDetailWo(isi, wo) {
  var s = statusWo(wo.ID), rg = dataRegu(wo.REGU), rr = realisasiWo(wo.ID), f = S.drafRow;
  var kunci = s.status === 'belum' ? woBerjalanRegu(wo.REGU, wo.ID) : null, hariLain = wo.TANGGAL !== hariIni();
  var temuan = temuanRowTerbuka(wo.PENYULANG, wo['SECTION/SEGMEN']), jalan = s.status === 'berjalan';
  var tombol = '';
  if (!S.absenForm && !hariLain) {
    if (s.status === 'belum') tombol = '<button class="tombol-utama" type="button" id="w-mulai"' + (kunci || !rg ? ' disabled' : '') + '>Mulai</button>';
    else if (s.status === 'berjalan') tombol = '<button class="tombol-utama tombol-istirahat" type="button" id="w-istirahat">Istirahat</button><button class="tombol" type="button" id="w-selesai">Selesai</button>';
    else if (s.status === 'istirahat') tombol = '<button class="tombol-utama" type="button" id="w-lanjut">Mulai lagi</button><button class="tombol" type="button" id="w-selesai">Selesai</button>';
  }
  var adaDraf = f && f.idRencana === wo.ID && (f.fotoSebelum || f.fotoSesudah || f.jenis);
  isi.innerHTML = '<button class="tombol-kembali" type="button" id="w-kembali">‹ Semua WO</button>' +
    '<h1>' + esc(wo.PENYULANG + ' · ' + wo['SECTION/SEGMEN']) + '</h1>' + htmlPesan() +
    '<div class="panel"><div class="tags">' + tagStatusWo(s.status) + '</div>' +
    '<dl class="rinci"><dt>Target</dt><dd>' + esc(teksTarget(wo)) + '</dd><dt>Regu</dt><dd>' + esc(wo.REGU + (rg ? ' · ' + rg.vendor : '')) + '</dd>' +
    (rg ? '<dt>Koordinator</dt><dd>' + esc(rg.koordinator) + ' · ' + rg.anggota.length + ' anggota</dd>' : '') +
    (wo.KETERANGAN ? '<dt>Keterangan</dt><dd>' + esc(wo.KETERANGAN) + '</dd>' : '') + '</dl>' +
    htmlLini(s.catatan) +
    (s.mulai && s.mulai.hadir ? '<p class="catatan">Hadir: ' + esc(s.mulai.hadir) + (s.mulai.tidakHadir ? ' · Tidak hadir: ' + esc(s.mulai.tidakHadir) : '') + '</p>' : '') +
    (S.absenForm ? htmlFormAbsen(wo) : '') +
    (tombol ? '<div class="absen-tombol">' + tombol + '</div>' : '') +
    (kunci ? '<p class="pesan pesan-info">🔒 ' + esc(wo.REGU) + ' masih mengerjakan WO ' + esc(kunci.PENYULANG + ' · ' + kunci['SECTION/SEGMEN']) + '. Tekan Selesai pada WO itu dulu.</p>' : '') +
    (!rg && s.status === 'belum' ? '<p class="pesan pesan-galat">Regu "' + esc(wo.REGU) + '" tidak ada di daftar regu aktif. Hubungi admin.</p>' : '') +
    (hariLain ? '<p class="catatan">WO ini dijadwalkan ' + esc(tglTampil(wo.TANGGAL)) + '.</p>' : '') +
    (s.status === 'istirahat' && !S.absenForm ? '<p class="pesan pesan-info">Regu sedang istirahat. Tekan <b>Mulai lagi</b> untuk melanjutkan, atau <b>Selesai</b> bila pekerjaan sudah selesai.</p>' : '') +
    (s.status === 'selesai' ? htmlRingkasWo(wo, s.gawang, 'Realisasi WO') + '<p class="catatan">WO selesai. Rinciannya ada di menu <b>Realisasi</b>.</p>' : '') +
    (s.status === 'belum' && !S.absenForm ? '<p class="catatan">Tekan Mulai untuk konfirmasi kehadiran pelaksana. Jam &amp; GPS dicatat otomatis.</p>' : '') + '</div>' +
    (s.status === 'berjalan' || s.status === 'istirahat' ?
      '<h2 class="judul-bagian">Temuan inspeksi ROW (' + temuan.length + ')</h2>' +
      (temuan.length ? temuan.map(function (t) {
        return '<div class="kartu kartu-temuan-row"><div class="kartu-judul">' + esc(tglTampil(t['TANGGAL INSPEKSI'])) + ' · ' + esc(t.ID) + '</div>' +
          (t['KETERANGAN'] ? '<div class="kartu-ket">' + esc(t['KETERANGAN']) + '</div>' : '') +
          '<div class="kartu-ket">' + esc(t['RENCANA TINDAK LANJUT'] || '') + (t['KOORDINAT'] ? ' · ' + esc(t['KOORDINAT']) : '') + '</div>' +
          htmlFotoServer(t._fotoTemuan, 'Foto temuan') +
          (jalan ? '<button class="tombol tombol-kecil" type="button" data-real-temuan="' + esc(t.ID) + '">Input realisasi temuan ini</button>' : '') + '</div>';
      }).join('') : '<div class="kosong-daftar">Tidak ada temuan inspeksi ROW yang belum dieksekusi di ' + esc(wo.PENYULANG + ' · ' + wo['SECTION/SEGMEN']) + '.</div>') +
      (jalan ? '<button class="tombol tombol-lebar" type="button" id="w-luar">+ Realisasi di luar temuan inspeksi</button>' : '') +
      (jalan && adaDraf ? '<button class="tombol tombol-lebar" type="button" id="w-draf">Lanjutkan draf realisasi</button>' : '')
      : '') +
    (s.status !== 'belum' ? '<h2 class="judul-bagian">Realisasi WO ini (' + rr.length + ')</h2>' + htmlTitikRealisasi(rr, false) : '');
  pasangDetailWo(wo);
}

/** Form Mulai (konfirmasi kehadiran + alasan) atau Selesai (jumlah gawang + ringkasan). */
function htmlFormAbsen(wo) {
  var a = S.absenForm, r = dataRegu(wo.REGU);
  if (a.jenis === 'MULAI') {
    var orang = r ? [r.koordinator].concat(r.anggota) : [];
    return '<div class="form-absen" id="f-absen"><b>Konfirmasi kehadiran pelaksana</b><p class="catatan">Centang yang hadir. Yang tidak hadir wajib diberi alasan.</p>' +
      orang.map(function (n, i) {
        var v = a.hadir[n], hadir = v === 'hadir';
        return '<div class="baris-hadir"><label class="cek-hadir"><input type="checkbox" data-hadir="' + esc(n) + '"' + (hadir ? ' checked' : '') + '><span>' + esc(n) + (i === 0 ? ' <small>(koordinator)</small>' : '') + '</span></label>' +
          (hadir ? '' : '<div class="alasan" role="radiogroup" aria-label="Alasan ' + esc(n) + ' tidak hadir">' + alasanTidakHadir().map(function (al) {
            return '<button type="button" class="pil' + (v === al ? ' aktif' : '') + '" data-alasan="' + esc(n) + '" data-nilai="' + esc(al) + '">' + esc(al) + '</button>';
          }).join('') + '</div>') + '</div>';
      }).join('') +
      '<label class="cek-hadir konfirmasi"><input type="checkbox" id="a-yakin"' + (a.yakin ? ' checked' : '') + '><span>Saya mengonfirmasi data kehadiran di atas benar.</span></label>' +
      '<div class="absen-tombol"><button class="tombol-utama" type="button" id="a-simpan">Mulai</button><button class="tombol" type="button" id="a-batal">Batal</button></div></div>';
  }
  var g = a.gawang === '' || a.gawang === undefined ? '' : a.gawang;
  return '<div class="form-absen" id="f-absen"><b>Selesai kerja</b>' + htmlRingkasWo(wo, g, 'Realisasi WO ini (sesuai input)') +
    '<div class="medan"><label for="a-gawang">Jumlah gawang dipangkas <span class="wajib">*</span></label>' +
    '<input id="a-gawang" type="number" min="0" step="1" inputmode="numeric" value="' + esc(g) + '" placeholder="0">' +
    '<p class="catatan" id="a-kms">' + meterGawang() + ' m per gawang · isi 0 bila tidak ada pemangkasan</p></div>' +
    '<div class="absen-tombol"><button class="tombol-utama" type="button" id="a-simpan">Selesai</button><button class="tombol" type="button" id="a-batal">Batal</button></div></div>';
}

async function catatAbsen(wo, jenis, tambahan) {
  if (jenis === 'MULAI') {
    var kunci = woBerjalanRegu(wo.REGU, wo.ID);
    if (kunci) { S.pesan = { jenis: 'galat', teks: wo.REGU + ' masih mengerjakan WO ' + kunci.PENYULANG + ' · ' + kunci['SECTION/SEGMEN'] + '. Tekan Selesai pada WO itu dulu.' }; gambar(); return; }
  }
  toast('Mencari lokasi GPS…');
  var l = await lokasiHp(20000);
  if (!l) { S.pesan = { jenis: 'galat', teks: 'Lokasi GPS belum didapat. Aktifkan lokasi lalu coba di tempat terbuka.' }; gambar(); return; }
  var waktu = waktuLokal(), id = 'ABS-' + waktu.slice(0, 10).replace(/-/g, '') + '-' + hex(4);
  var item = { idAntre: id, aksi: 'absenRow', dibuat: new Date().toISOString(), status: 'menunggu', pesan: '', percobaan: 0,
    ringkasan: { judul: LABEL_ABSEN[jenis] + ' · ' + wo.PENYULANG + ' · ' + wo['SECTION/SEGMEN'], sub: wo.REGU + ' · ' + waktu.slice(11, 16) + ' · ' + l.koordinat, tanggal: waktu.slice(0, 10) },
    muatan: Object.assign({ idKlien: id, idRencana: wo.ID, jenis: jenis, waktu: waktu, koordinat: l.koordinat, regu: wo.REGU }, tambahan || {}) };
  try { await DB.simpan(item); } catch (e) { S.pesan = { jenis: 'galat', teks: 'Gagal menyimpan di HP: ' + e.message }; gambar(); return; }
  await muatAntrean();
  S.absenForm = null;
  S.pesan = { jenis: 'ok', teks: LABEL_ABSEN[jenis] + ' tercatat ' + waktu.slice(11, 16) + ' (±' + l.akurasi + ' m).' +
    (jenis === 'MULAI' ? ' Temuan inspeksi ROW di section ini tampil di bawah.' : jenis === 'SELESAI' ? ' WO selesai.' : '') };
  gambar(); window.scrollTo(0, 0); kirimAntrean();
}

function bukaFormRealisasi(wo, mode, idTemuan) {
  var f = S.drafRow, sama = f && f.idRencana === wo.ID && f.mode === mode && (f.idTemuan[0] || '') === (idTemuan || '');
  var berisi = f && (f.fotoSebelum || f.fotoSesudah || f.fotoPengukuran);
  if (!sama) {
    if (berisi && !confirm('Draf realisasi sebelumnya (dengan foto) akan diganti. Lanjutkan?')) return;
    S.drafRow = drafRowBaru(wo.ID, mode, idTemuan);
    if (idTemuan) { var t = cariTemuan(idTemuan); if (t && t.KOORDINAT) S.drafRow.koordinat = t.KOORDINAT; }
    simpanDrafRow();
  }
  S.formRow = true; S.pesan = null; gambar(); window.scrollTo(0, 0);
}

function pasangDetailWo(wo) {
  $('#w-kembali').onclick = function () { S.wo = null; tulisLokal(KUNCI.wo, null); S.absenForm = null; S.pesan = null; gambar(); window.scrollTo(0, 0); };
  if ($('#w-mulai')) $('#w-mulai').onclick = function () { S.absenForm = { jenis: 'MULAI', hadir: {}, yakin: false }; gambar(); };
  if ($('#w-istirahat')) $('#w-istirahat').onclick = function () { catatAbsen(wo, 'ISTIRAHAT'); };
  if ($('#w-lanjut')) $('#w-lanjut').onclick = function () { catatAbsen(wo, 'LANJUT'); };
  if ($('#w-selesai')) $('#w-selesai').onclick = function () { S.absenForm = { jenis: 'SELESAI', gawang: '' }; gambar(); };
  if ($('#w-luar')) $('#w-luar').onclick = function () { bukaFormRealisasi(wo, 'luar', ''); };
  if ($('#w-draf')) $('#w-draf').onclick = function () { S.formRow = true; gambar(); window.scrollTo(0, 0); };
  Array.prototype.forEach.call(document.querySelectorAll('[data-real-temuan]'), function (b) {
    b.onclick = function () { bukaFormRealisasi(wo, 'temuan', b.getAttribute('data-real-temuan')); };
  });
  if (!$('#f-absen')) return;
  var a = S.absenForm;
  Array.prototype.forEach.call(document.querySelectorAll('[data-hadir]'), function (el) {
    el.onchange = function () { a.hadir[el.getAttribute('data-hadir')] = el.checked ? 'hadir' : undefined; gambar(); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-alasan]'), function (el) {
    el.onclick = function () { a.hadir[el.getAttribute('data-alasan')] = el.getAttribute('data-nilai'); gambar(); };
  });
  if ($('#a-yakin')) $('#a-yakin').onchange = function () { a.yakin = $('#a-yakin').checked; };
  if ($('#a-gawang')) $('#a-gawang').oninput = function () {
    a.gawang = $('#a-gawang').value;
    var lama = document.querySelector('#f-absen .ringkas-realisasi'), wadah = document.createElement('div');
    wadah.innerHTML = htmlRingkasWo(wo, a.gawang, 'Realisasi WO ini (sesuai input)');
    if (lama) lama.parentNode.replaceChild(wadah.firstChild, lama);
  };
  $('#a-batal').onclick = function () { S.absenForm = null; gambar(); };
  $('#a-simpan').onclick = function () {
    if (a.jenis === 'MULAI') {
      var r = dataRegu(wo.REGU), orang = r ? [r.koordinator].concat(r.anggota) : [];
      var hadir = orang.filter(function (n) { return a.hadir[n] === 'hadir'; });
      var tidak = orang.filter(function (n) { return a.hadir[n] !== 'hadir'; });
      var tanpa = tidak.filter(function (n) { return !a.hadir[n]; });
      if (!hadir.length) { toast('Centang minimal satu pelaksana yang hadir.'); return; }
      if (tanpa.length) { toast('Pilih alasan tidak hadir untuk: ' + tanpa.join(', ')); return; }
      if (!a.yakin) { toast('Centang konfirmasi kehadiran.'); return; }
      catatAbsen(wo, 'MULAI', { hadir: hadir, tidakHadir: tidak.map(function (n) { return { nama: n, alasan: a.hadir[n] }; }) });
    } else {
      var g = a.gawang;
      if (g === '' || !(+g >= 0) || +g !== Math.round(+g)) { toast('Isi jumlah gawang (bilangan bulat, 0 bila tidak ada).'); return; }
      if (!confirm('Selesaikan WO ' + wo.PENYULANG + ' · ' + wo['SECTION/SEGMEN'] + ' dengan ' + g + ' gawang? Setelah Selesai, WO tidak bisa dimulai lagi.')) return;
      catatAbsen(wo, 'SELESAI', { gawang: +g });
    }
  };
}

/* ----- Form realisasi (satu titik) ----- */
function ambilIsianRow() {
  var f = S.drafRow, nilai = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : undefined; };
  var j = document.querySelector('input[name="r-jenis"]:checked'); if (j) f.jenis = j.value;
  var k = nilai('r-koor'); if (k !== undefined) f.koordinat = k;
  var ket = nilai('r-ket'); if (ket !== undefined) f.keterangan = ket;
  return f;
}

function gambarFormRealisasi(isi, wo) {
  var d = S.dataRow, f = S.drafRow, ukur = apakahTebang(f.jenis), t = f.mode === 'temuan' ? cariTemuan(f.idTemuan[0]) : null;
  isi.innerHTML = '<button class="tombol-kembali" type="button" id="r-kembali">‹ Kembali ke WO</button>' +
    '<h1>Input realisasi</h1><p class="sub">' + esc(wo.PENYULANG + ' · ' + wo['SECTION/SEGMEN'] + ' · ' + wo.REGU) + '</p>' + htmlPesan() +
    (t ? '<div class="temuan-row"><b>Menyelesaikan temuan inspeksi</b><div class="kartu-ket">' + esc(tglTampil(t['TANGGAL INSPEKSI'])) + ' · ' + esc(t.ID) + '</div>' +
      (t.KETERANGAN ? '<div class="kartu-ket">' + esc(t.KETERANGAN) + '</div>' : '') + htmlFotoServer(t._fotoTemuan, 'Foto temuan') +
      '<p class="catatan">Saat realisasi terkirim, temuan ini otomatis menjadi Sudah Eksekusi dengan foto sesudah.</p></div>'
      : f.mode === 'temuan' ? '<p class="pesan pesan-info">Temuan ini sudah ditutup / tidak lagi terbuka. Realisasi tetap bisa disimpan.</p>'
      : '<p class="pesan pesan-info">Realisasi di luar temuan inspeksi.</p>') +
    '<form id="f-row" class="panel" novalidate>' +
    '<div class="medan"><span class="label">Jenis pekerjaan <span class="wajib">*</span></span>' + radio('r-jenis', d.pilihan.jenis, f.jenis) + '</div>' +
    htmlFoto('r-f1', 'Foto sebelum', true, f.fotoSebelum) + htmlFoto('r-f2', 'Foto sesudah', true, f.fotoSesudah) +
    (ukur ? htmlFoto('r-f3', 'Foto pengukuran batang', true, f.fotoPengukuran) : '') +
    '<div class="medan"><label for="r-koor">Titik koordinat <span class="wajib">*</span></label><div class="baris-isian"><input id="r-koor" type="text" inputmode="decimal" value="' + esc(f.koordinat) + '" placeholder="-3.123456, 121.123456">' +
    '<button class="tombol" type="button" id="r-gps">Lokasi saya</button></div><p class="catatan">Terisi otomatis dari foto sesudah.</p></div>' +
    '<div class="medan"><label for="r-ket">Keterangan</label><textarea id="r-ket" placeholder="mis. jenis pohon, jumlah, kondisi…">' + esc(f.keterangan) + '</textarea></div>' +
    '<button class="tombol-utama" type="submit">Simpan realisasi</button></form>';
  pasangFormRealisasi(wo);
}

function pasangFormRealisasi(wo) {
  var f = S.drafRow, ulang = function () { ambilIsianRow(); simpanDrafRow(); gambar(); };
  $('#r-kembali').onclick = function () { ambilIsianRow(); simpanDrafRow(); S.formRow = false; S.pesan = null; gambar(); window.scrollTo(0, 0); };
  $('#f-row').addEventListener('change', function () { ambilIsianRow(); simpanDrafRow(); });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="r-jenis"]'), function (el) { el.onchange = ulang; });
  var lokasiTeks = wo.PENYULANG + ' · ' + wo['SECTION/SEGMEN'];
  pasangFoto('r-f1', function (foto) { ambilIsianRow(); f.fotoSebelum = foto; simpanDrafRow(); gambar(); }, 'MOTAHA ROW · ULP Kolaka Utara', lokasiTeks);
  pasangFoto('r-f2', function (foto) {
    ambilIsianRow(); f.fotoSesudah = foto;
    if (foto.koordinat) { f.koordinat = foto.koordinat; toast('Koordinat diisi dari foto sesudah.'); }
    simpanDrafRow(); gambar();
  }, 'MOTAHA ROW · ULP Kolaka Utara', lokasiTeks);
  pasangFoto('r-f3', function (foto) { ambilIsianRow(); f.fotoPengukuran = foto; simpanDrafRow(); gambar(); }, 'MOTAHA ROW · Pengukuran batang', lokasiTeks);
  $('#r-gps').onclick = function () { ambilLokasi(function (k, ak) { ambilIsianRow(); f.koordinat = k; simpanDrafRow(); gambar(); toast('Lokasi didapat (±' + ak + ' m).'); }); };
  $('#f-row').onsubmit = async function (e) {
    e.preventDefault();
    ambilIsianRow();
    var ukur = apakahTebang(f.jenis), st = statusWo(wo.ID).status;
    var salah = st !== 'berjalan' ? (st === 'istirahat' ? 'Regu sedang istirahat — tekan Mulai lagi dulu.' : 'WO ini tidak sedang berjalan.') :
      !f.jenis ? 'Pilih jenis pekerjaan.' : !f.fotoSebelum ? 'Foto sebelum wajib dilampirkan.' : !f.fotoSesudah ? 'Foto sesudah wajib dilampirkan.' :
      ukur && !f.fotoPengukuran ? 'Penebangan: foto pengukuran batang wajib dilampirkan.' :
      !koordinatSah(f.koordinat) ? 'Titik koordinat wajib (tekan Lokasi saya).' : '';
    if (salah) { S.pesan = { jenis: 'galat', teks: salah }; gambar(); window.scrollTo(0, 0); return; }
    var terbuka = temuanRowTerbuka(wo.PENYULANG, wo['SECTION/SEGMEN']).map(function (t) { return t.ID; });
    var idTemuan = (f.idTemuan || []).filter(function (id) { return terbuka.indexOf(id) !== -1; });
    var waktu = waktuLokal(), id = 'ROW-' + waktu.slice(0, 10).replace(/-/g, '') + '-' + hex(4);
    var item = { idAntre: id, aksi: 'simpanRealisasiRow', dibuat: new Date().toISOString(), status: 'menunggu', pesan: '', percobaan: 0,
      ringkasan: { judul: wo.PENYULANG + ' · ' + wo['SECTION/SEGMEN'], sub: f.jenis + ' · ROW · ' + waktu.slice(11, 16) + (idTemuan.length ? ' · menutup temuan ' + idTemuan.join(', ') : ''), tanggal: waktu.slice(0, 10) },
      muatan: { idKlien: id, waktu: waktu, penyulang: wo.PENYULANG, section: wo['SECTION/SEGMEN'], jenis: f.jenis, koordinat: f.koordinat, keterangan: f.keterangan,
        regu: wo.REGU, idRencana: wo.ID, idTemuan: idTemuan,
        fotoSebelum: { mime: f.fotoSebelum.mime, data: f.fotoSebelum.data }, fotoSesudah: { mime: f.fotoSesudah.mime, data: f.fotoSesudah.data },
        fotoPengukuran: ukur ? { mime: f.fotoPengukuran.mime, data: f.fotoPengukuran.data } : null } };
    try { await DB.simpan(item); } catch (err) { S.pesan = { jenis: 'galat', teks: 'Gagal menyimpan di HP: ' + err.message }; gambar(); return; }
    S.drafRow = drafRowBaru(); simpanDrafRow(); S.formRow = false;
    await muatAntrean();
    S.pesan = { jenis: 'ok', teks: (navigator.onLine ? 'Realisasi tersimpan dan sedang dikirim.' : 'Realisasi tersimpan di HP. Dikirim otomatis saat ada sinyal.') +
      (idTemuan.length ? ' Temuan ' + idTemuan.join(', ') + ' ikut ditutup.' : '') };
    gambar(); window.scrollTo(0, 0);
    kirimAntrean();
  };
}

/* ----- Menu Realisasi: WO yang sudah Selesai (7 hari terakhir) ----- */
function gambarRealisasiHp(isi) {
  var d = S.dataRow;
  if (!d) { isi.innerHTML = '<h1>Realisasi</h1><div class="panel"><p>' + (navigator.onLine ? '<span class="putar"></span> Mengambil data ROW…' : 'Data ROW belum ada di HP ini. Sambungkan ke internet sekali.') + '</p></div>'; return; }
  var semua = absenSemua();
  var selesai = (d.rencana || []).map(function (r) { return { wo: r, st: statusWo(r.ID, semua) }; }).filter(function (x) { return x.st.status === 'selesai'; })
    .sort(function (a, b) { return String(b.st.selesai.waktu) < String(a.st.selesai.waktu) ? -1 : 1; });
  var reguAda = {}; selesai.forEach(function (x) { reguAda[x.wo.REGU] = 1; });
  var saring = S.saringRegu && reguAda[S.saringRegu] ? S.saringRegu : '';
  var detail = S.detailReal ? selesai.filter(function (x) { return x.wo.ID === S.detailReal; })[0] : null;
  if (detail) {
    var wo = detail.wo, s = detail.st, rg = dataRegu(wo.REGU);
    isi.innerHTML = '<button class="tombol-kembali" type="button" id="rl-kembali">‹ Semua realisasi</button>' +
      '<h1>' + esc(wo.PENYULANG + ' · ' + wo['SECTION/SEGMEN']) + '</h1><p class="sub">' + esc(tglTampil(wo.TANGGAL) + ' · ' + wo.REGU + (rg ? ' · ' + rg.vendor : '')) + '</p>' +
      '<div class="panel">' + htmlLini(s.catatan) +
      (s.mulai && s.mulai.hadir ? '<p class="catatan">Hadir: ' + esc(s.mulai.hadir) + (s.mulai.tidakHadir ? ' · Tidak hadir: ' + esc(s.mulai.tidakHadir) : '') + '</p>' : '') +
      htmlRingkasWo(wo, s.gawang, 'Realisasi vs target (' + esc(teksTarget(wo)) + ')') + '</div>' +
      '<h2 class="judul-bagian">Titik realisasi</h2>' + htmlTitikRealisasi(realisasiWo(wo.ID), true);
    $('#rl-kembali').onclick = function () { S.detailReal = null; gambar(); window.scrollTo(0, 0); };
    pasangFotoServer();
    return;
  }
  var tampil = selesai.filter(function (x) { return !saring || x.wo.REGU === saring; });
  isi.innerHTML = '<h1>Realisasi</h1><p class="sub">Pekerjaan ROW yang sudah Selesai, 7 hari terakhir.</p>' +
    (Object.keys(reguAda).length > 1 ? '<div class="medan"><select id="rl-regu"><option value="">Semua regu</option>' + Object.keys(reguAda).sort().map(function (n) {
      return '<option value="' + esc(n) + '"' + (n === saring ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></div>' : '') +
    (tampil.length ? tampil.map(function (x) {
      var wo = x.wo, rr = realisasiWo(wo.ID), nTebang = rr.filter(function (r) { return apakahTebang(r.jenis); }).length;
      var kms = x.st.gawang !== '' && x.st.gawang !== undefined && x.st.gawang !== null ? angkaId(+x.st.gawang * meterGawang() / 1000, 2) + ' kms' : '—';
      return '<button type="button" class="kartu kartu-rencana" data-real="' + esc(wo.ID) + '">' +
        '<div class="kartu-judul">' + esc(wo.PENYULANG + ' · ' + wo['SECTION/SEGMEN']) + '</div>' +
        '<div class="kartu-ket">' + esc(tglTampil(wo.TANGGAL)) + ' · ' + esc(jamDari(x.st.mulai && x.st.mulai.waktu) + '–' + jamDari(x.st.selesai.waktu)) + ' · ' + esc(wo.REGU) + '</div>' +
        '<div class="tags"><span class="tag tag-sudah">Pangkas ' + kms + '</span><span class="tag tag-sudah">Tebang ' + nTebang + ' btg</span><span class="tag">' + rr.length + ' titik</span>' +
        (x.st.selesai.antre ? '<span class="tag tag-tunggu">Belum terkirim</span>' : '') + '</div></button>';
    }).join('') : '<div class="kosong-daftar">Belum ada WO yang selesai dalam 7 hari terakhir.</div>');
  if ($('#rl-regu')) $('#rl-regu').onchange = function () { S.saringRegu = $('#rl-regu').value; gambar(); };
  Array.prototype.forEach.call(document.querySelectorAll('[data-real]'), function (b) {
    b.onclick = function () { S.detailReal = b.getAttribute('data-real'); gambar(); window.scrollTo(0, 0); };
  });
}

/* ---------- Antrean ---------- */
function gambarAntrean(isi) {
  var a = S.antrean, tolak = a.filter(function (x) { return x.status === 'ditolak'; }).length;
  isi.innerHTML = '<h1>Antrean kiriman</h1><p class="sub">' + (a.length ? a.length + ' data di HP belum terkirim' + (tolak ? ', ' + tolak + ' ditolak server' : '') + '.' : 'Semua data sudah terkirim.') +
    (S.terakhirKirim ? ' Terakhir terkirim ' + esc(jamTampil(S.terakhirKirim)) + '.' : '') + '</p>' + htmlPesan() +
    (a.length > tolak ? '<button class="tombol-utama" id="a-kirim"' + (S.mengirim || !navigator.onLine ? ' disabled' : '') + ' style="margin-bottom:14px">' +
      (S.mengirim ? '<span class="putar"></span> Mengirim…' : navigator.onLine ? 'Kirim sekarang' : 'Menunggu sinyal…') + '</button>' : '') +
    (a.length ? a.map(function (x, i) {
      var r = x.ringkasan || {};
      return '<div class="kartu"><div class="kartu-atas"><span>Disimpan ' + esc(jamTampil(x.dibuat)) + '</span><span>' + esc(x.idAntre) + '</span></div>' +
        '<div class="kartu-judul">' + esc(r.judul) + '</div><div class="kartu-ket">' + esc(r.sub) + '</div>' +
        '<div class="tags">' + (x.status === 'ditolak' ? '<span class="tag tag-tolak">Ditolak server</span>' : '<span class="tag tag-tunggu">Menunggu kirim</span>') + '</div>' +
        (x.pesan ? '<p class="catatan" style="margin-top:8px;color:' + (x.status === 'ditolak' ? 'var(--danger)' : 'var(--muted)') + '">' + esc(x.pesan) + '</p>' : '') +
        (x.status === 'ditolak' ? '<div style="display:flex;gap:8px;margin-top:10px">' +
          (x.aksi === 'simpanInspeksi' ? '<button class="tombol tombol-kecil" data-perbaiki="' + i + '">Perbaiki</button>' : '') +
          '<button class="tombol tombol-kecil" data-ulang="' + i + '">Coba kirim lagi</button>' +
          '<button class="tombol tombol-kecil tombol-bahaya" data-hapus="' + i + '">Hapus</button></div>' : '') + '</div>';
    }).join('') : '<div class="kosong-daftar">Tidak ada data yang menunggu.</div>');
  if ($('#a-kirim')) $('#a-kirim').onclick = function () { kirimAntrean(); };
  var tiap = function (attr, kerja) {
    Array.prototype.forEach.call(document.querySelectorAll('[' + attr + ']'), function (b) { b.onclick = function () { kerja(a[+b.getAttribute(attr)]); }; });
  };
  tiap('data-hapus', async function (x) {
    if (!confirm('Hapus data ini dari HP? Data yang dihapus tidak bisa dikembalikan.')) return;
    await DB.hapus(x.idAntre); await muatAntrean(); gambar();
  });
  tiap('data-ulang', async function (x) { x.status = 'menunggu'; x.pesan = ''; await DB.simpan(x); await muatAntrean(); gambar(); kirimAntrean(); });
  tiap('data-perbaiki', function (x) {
    var m = x.muatan;
    S.draf = Object.assign(drafBaru(), {
      tanggal: m.tanggal, penyulang: m.penyulang, section: m.section, jenis: m.jenis, rencana: m.rencana, material: m.material,
      koordinat: m.koordinat, keterangan: m.keterangan, status: m.status, petugasInspeksi: m.petugasInspeksi,
      petugasEksekusi: namaLogin(), tanggalEksekusi: m.tanggalEksekusi || hariIni(),
      fotoTemuan: m.fotoTemuan ? { mime: m.fotoTemuan.mime, data: m.fotoTemuan.data, kb: Math.round(m.fotoTemuan.data.length * 0.75 / 1024) } : null,
      fotoEksekusi: m.fotoEksekusi ? { mime: m.fotoEksekusi.mime, data: m.fotoEksekusi.data, kb: Math.round(m.fotoEksekusi.data.length * 0.75 / 1024) } : null
    });
    S.gantiAntre = x.idAntre; S.tab = 'input'; S.pesan = { jenis: 'galat', teks: 'Ditolak server: ' + x.pesan }; gambar(); window.scrollTo(0, 0);
  });
}

/* ---------- Pembaruan APK (rilis GitHub) ---------- */
/** '2026-10-07.14' -> 2026100714 (sama dengan versionCode APK). */
function kodeVersi(v) {
  var m = /^v?(\d{4})-(\d{2})-(\d{2})\.(\d+)$/.exec(String(v || ''));
  return m ? (+(m[1] + m[2] + m[3])) * 100 + (+m[4]) : 0;
}

async function cekPembaruan(manual) {
  var repo = String(window.MOTAHA_REPO || '');
  if (!DI_APK || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !navigator.onLine) { if (manual) toast(navigator.onLine ? 'Pemeriksaan pembaruan tidak tersedia.' : 'Sedang offline.'); return; }
  var simpan = bacaLokal('motaha-rilis');
  if (!manual && simpan && Date.now() - simpan.waktu < 6 * 3600000) { terapkanRilis(simpan.tag, repo); return; }
  try {
    var r = await fetch('https://api.github.com/repos/' + repo + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var j = await r.json();
    tulisLokal('motaha-rilis', { tag: j.tag_name, waktu: Date.now() });
    terapkanRilis(j.tag_name, repo);
    if (manual) toast(S.pembaruan ? 'Versi baru ' + S.pembaruan.versi + ' tersedia.' : 'Aplikasi sudah versi terbaru (' + VERSI_PWA + ').');
  } catch (e) { if (manual) toast('Gagal memeriksa pembaruan.'); }
}

function terapkanRilis(tag, repo) {
  var baru = kodeVersi(tag) > kodeVersi(VERSI_PWA);
  var bagian = repo.split('/');
  S.pembaruan = baru ? { versi: String(tag).replace(/^v/, ''), url: 'https://' + bagian[0].toLowerCase() + '.github.io/' + bagian[1] + '/unduh/' } : null;
  gambar();
}

/* ---------- Mulai ---------- */
async function mulai() {
  terapkanTema();
  var dariKonfig = String(window.MOTAHA_API || '');
  S.api = /^https?:\/\//.test(dariKonfig) ? dariKonfig : (bacaLokal(KUNCI.api) || '');
  S.sesi = bacaLokal(KUNCI.sesi);
  S.data = bacaLokal(KUNCI.data);
  S.dataRow = bacaLokal(KUNCI.dataRow);
  try { S.draf = (await DB.ambil('draf')) || null; } catch (e) { S.draf = null; }
  if (!S.draf) S.draf = drafBaru();
  try { S.drafRow = (await DB.ambil('drafRow')) || null; } catch (e) { S.drafRow = null; }
  if (!S.drafRow || S.drafRow.mode === undefined) S.drafRow = drafRowBaru(); // draf format lama (sebelum alur WO) dibuang
  S.wo = bacaLokal(KUNCI.wo);
  await muatAntrean();
  gambar();
  if (S.sesi && !S.sesi.habis && navigator.onLine) { muatData(!!S.data); kirimAntrean(); }
  cekPembaruan(false);

  window.addEventListener('online', function () { gambar(); muatData(true); kirimAntrean(); });
  window.addEventListener('offline', function () { gambar(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { kirimAntrean(); }
    else simpanDrafSekarang();
  });
  setInterval(function () { if (document.visibilityState === 'visible') kirimAntrean(); }, 60000);
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.pasang = e; });

  if (DI_APK && 'serviceWorker' in navigator) {
    // Di APK berkas sudah lokal; lepas service worker (bila ada) agar tidak menyajikan berkas versi lama.
    navigator.serviceWorker.getRegistrations().then(function (r) { r.forEach(function (x) { x.unregister(); }); }).catch(function () {});
  } else if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var baru = reg.installing;
        baru.addEventListener('statechange', function () {
          if (baru.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Versi baru aplikasi siap — dipakai saat aplikasi dibuka lagi.');
          }
        });
      });
    }).catch(function () { /* mis. dibuka dari file:// */ });
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') mulai();
