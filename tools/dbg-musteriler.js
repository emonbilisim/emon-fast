// Geçici teşhis: musteriler tablosunu doğrudan oku (uygulamayı atla).
// Çalıştırma (yerelden, sunucuya kopyalamadan):
//   ssh root@157.90.236.79 'cd /var/www/emonfast && node' < tools/dbg-musteriler.js
require('dotenv').config();
const { Pool } = require('pg');
// Uygulamanın .env'iyle AYNI bağlantı: DB_* yoksa DATABASE_URL'e, o da yoksa PG* defaultlarına düş.
const cfg = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : (process.env.DB_HOST || process.env.DB_NAME)
    ? {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASS || process.env.DB_PASSWORD,
      }
    : {};
const p = new Pool(cfg);
(async () => {
  try {
    const d = await p.query('SELECT current_database() db, inet_server_addr() host');
    console.log('DB:', d.rows[0].db, '| host:', d.rows[0].host || 'local');
    const a = await p.query('SELECT count(*)::int n, max(olusturma) mx FROM musteriler');
    console.log('toplam musteri:', a.rows[0].n, '| en son olusturma:', a.rows[0].mx);
    const b = await p.query('SELECT data FROM musteriler ORDER BY olusturma DESC NULLS LAST');
    b.rows.forEach((x) => console.log(' -', x.data && x.data.firma, '| not:', x.data && x.data.not));
    const c = await p.query(
      "SELECT tgname FROM pg_trigger WHERE tgrelid = 'musteriler'::regclass AND NOT tgisinternal"
    );
    console.log('triggerlar:', c.rows.map((r) => r.tgname).join(', ') || 'YOK');
    // musteriler bir VIEW mi, gerçek TABLE mi?
    const e = await p.query("SELECT relkind FROM pg_class WHERE relname='musteriler'");
    console.log('relkind:', e.rows.map((r) => r.relkind).join(',') || '?', '(r=tablo, v=view, m=matview)');
  } catch (e) {
    console.log('ERR:', e.message);
  }
  process.exit();
})();
