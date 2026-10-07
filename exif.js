/* Koordinat GPS dari EXIF foto JPEG (salinan dari apps-script/Logika.html — uji/uji.cjs memeriksa keduanya sama). */
/** ArrayBuffer JPEG -> "lat, lon" (6 desimal) atau '' bila tidak ada GPS. */
function koordinatDariExif(buffer) {
  try {
    var v = new DataView(buffer);
    if (v.getUint16(0) !== 0xFFD8) return '';
    var p = 2;
    while (p + 4 < v.byteLength) {
      var penanda = v.getUint16(p), panjang = v.getUint16(p + 2);
      if (penanda === 0xFFE1 && v.getUint32(p + 4) === 0x45786966) { // "Exif"
        var t = p + 10, le = v.getUint16(t) === 0x4949;
        var u16 = function (o) { return v.getUint16(t + o, le); }, u32 = function (o) { return v.getUint32(t + o, le); };
        var cariTag = function (ifd, tag) {
          var n = u16(ifd);
          for (var i = 0; i < n; i++) { var e = ifd + 2 + i * 12; if (u16(e) === tag) return e; }
          return -1;
        };
        var eGps = cariTag(u32(4), 0x8825);
        if (eGps < 0) return '';
        var gps = u32(eGps + 8);
        var derajat = function (tag) {
          var e = cariTag(gps, tag); if (e < 0) return null;
          var o = u32(e + 8), nilai = [0, 1, 2].map(function (k) { var b = u32(o + k * 8 + 4); return b ? u32(o + k * 8) / b : 0; });
          return nilai[0] + nilai[1] / 60 + nilai[2] / 3600;
        };
        var arah = function (tag) { var e = cariTag(gps, tag); return e < 0 ? '' : String.fromCharCode(v.getUint8(t + e + 8)); };
        var lat = derajat(2), lon = derajat(4);
        if (lat === null || lon === null || (!lat && !lon)) return '';
        if (arah(1) === 'S') lat = -lat;
        if (arah(3) === 'W') lon = -lon;
        return lat.toFixed(6) + ', ' + lon.toFixed(6);
      }
      if ((penanda & 0xFF00) !== 0xFF00) return '';
      p += 2 + panjang;
    }
  } catch (err) { /* bukan JPEG / EXIF rusak */ }
  return '';
}

/** ArrayBuffer JPEG -> waktu foto diambil dari EXIF ("YYYY-MM-DDTHH:MM:SS", jam kamera) atau '' bila tidak ada.
 *  Urutan: DateTimeOriginal (0x9003) di Exif IFD, lalu DateTime (0x0132) di IFD0. */
function waktuDariExif(buffer) {
  try {
    var v = new DataView(buffer);
    if (v.getUint16(0) !== 0xFFD8) return '';
    var p = 2;
    while (p + 4 < v.byteLength) {
      var penanda = v.getUint16(p), panjang = v.getUint16(p + 2);
      if (penanda === 0xFFE1 && v.getUint32(p + 4) === 0x45786966) {
        var t = p + 10, le = v.getUint16(t) === 0x4949;
        var u16 = function (o) { return v.getUint16(t + o, le); }, u32 = function (o) { return v.getUint32(t + o, le); };
        var cariTag = function (ifd, tag) {
          var n = u16(ifd);
          for (var i = 0; i < n; i++) { var e = ifd + 2 + i * 12; if (u16(e) === tag) return e; }
          return -1;
        };
        var teks = function (e) {
          var n = u32(e + 4), o = n > 4 ? u32(e + 8) : e + 8, s = '';
          for (var i = 0; i < Math.min(n, 19); i++) s += String.fromCharCode(v.getUint8(t + o + i));
          var m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
          return m && m[1] !== '0000' ? m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6] : '';
        };
        var ifd0 = u32(4), eExif = cariTag(ifd0, 0x8769);
        if (eExif >= 0) { var e1 = cariTag(u32(eExif + 8), 0x9003); if (e1 >= 0 && teks(e1)) return teks(e1); }
        var e2 = cariTag(ifd0, 0x0132);
        return e2 >= 0 ? teks(e2) : '';
      }
      if ((penanda & 0xFF00) !== 0xFF00) return '';
      p += 2 + panjang;
    }
  } catch (err) { /* bukan JPEG / EXIF rusak */ }
  return '';
}
