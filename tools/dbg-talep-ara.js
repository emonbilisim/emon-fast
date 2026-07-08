// SALT-OKUNUR teşhis: kaybolan talepleri (Anadolubank / Sarten) canlı DB'de ara.
// Çalıştırma (yerelden, sunucuya kopyalamadan):
//   ssh root@157.90.236.79 'cd /var/www/emonfast && node' < tools/dbg-talep-ara.js
require('dotenv').config();
const { Pool } = require('pg');
const cfg = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : (process.env.DB_HOST || process.env.DB_NAME)
    ? { host: process.env.DB_HOST, port: process.env.DB_PORT || 5432, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASS || process.env.DB_PASSWORD }
    : {};
const p = new Pool(cfg);
const ARA = /anadolu|sarten/i;

function taleplerBul(obj) {
  // Blob içinde TALEPLER dizisini bul (doğrudan .TALEPLER ya da iç içe data).
  if (!obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj.TALEPLER)) return obj.TALEPLER;
  if (obj.data && Array.isArray(obj.data.TALEPLER)) return obj.data.TALEPLER;
  if (obj.veri && Array.isArray(obj.veri.TALEPLER)) return obj.veri.TALEPLER;
  return null;
}

(async () => {
  try {
    const d = await p.query('SELECT current_database() db, now() ts');
    console.log('DB:', d.rows[0].db, '| zaman:', d.rows[0].ts);

    const t = await p.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    console.log('TABLOLAR:', t.rows.map(r => r.table_name).join(', '));

    let bulunanBlob = 0;
    for (const r of t.rows) {
      const tn = r.table_name;
      const cols = await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [tn]);
      const jcols = cols.rows.filter(c => /json/.test(c.data_type) || c.data_type === 'text').map(c => c.column_name);
      if (!jcols.length) continue;
      let rows;
      try { rows = (await p.query('SELECT * FROM "' + tn + '"')).rows; } catch (e) { continue; }
      for (const row of rows) {
        for (const col of jcols) {
          let val = row[col];
          if (val == null) continue;
          if (typeof val === 'string') { try { val = JSON.parse(val); } catch { continue; } }
          const talepler = taleplerBul(val);
          if (!talepler) continue;
          bulunanBlob++;
          const eslesen = talepler.filter(x => x && ARA.test((x.musteri || '') + ' ' + (x.urun || '') + ' ' + (x.konu || '')));
          console.log('\n==================================================');
          console.log('BLOB: tablo=' + tn + ' kolon=' + col + ' | toplam TALEP: ' + talepler.length + ' | eşleşen: ' + eslesen.length);
          const tarihler = talepler.map(x => x && x.tarih).filter(Boolean).sort();
          console.log('  en yeni talep tarihi:', tarihler[tarihler.length - 1] || '—');
          eslesen.forEach(x => {
            console.log('  → no=' + (x.no || '?') + ' | musteri=' + (x.musteri || '?') + ' | durum=' + (x.durum || '?') +
              ' | satici=' + (x.satici ?? '?') + ' | saticiEmail=' + (x.saticiEmail || '?') +
              ' | tarih=' + (x.tarih || '?') + ' | mailId=' + (x.mailId ? 'var' : 'yok') +
              ' | gonderildi=' + (!!x.musteriTeklifGonderildi));
          });
          // Oto-talep taslakları da bu blob'da tutuluyorsa (OTO_DURUM) onları da tara
          const oto = (val.OTO_DURUM || val.otoDurum || (val.data && val.data.OTO_DURUM));
          if (oto && Array.isArray(oto.taslaklar)) {
            const taslakEsl = oto.taslaklar.filter(x => x && ARA.test((x.musteri || '') + ' ' + (x.konu || '') + ' ' + (x.ozet || '')));
            console.log('  OTO taslak toplam: ' + oto.taslaklar.length + ' | eşleşen taslak: ' + taslakEsl.length);
            taslakEsl.forEach(x => console.log('     ⌁ taslak tip=' + x.tip + ' | musteri=' + (x.musteri||'?') + ' | konu=' + (x.konu||'') + ' | tarih=' + (x.tarih||x.olusturma||'?')));
          }
        }
      }
    }
    if (!bulunanBlob) console.log('\n⚠ TALEPLER içeren blob bulunamadı — şema beklenmedik.');
  } catch (e) { console.log('ERR:', e.message); }
  process.exit();
})();
