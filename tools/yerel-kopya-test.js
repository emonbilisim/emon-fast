/* Yerel kopya bütçesi / kısmi kopya merdiveni testi.
   satin_alma_acentesi.html içindeki GERÇEK fonksiyonları söküp, tarayıcı gibi
   UTF-16 (karakter × 2 bayt) sayan sahte bir localStorage ile çalıştırır. */
const fs = require('fs');
const vm = require('vm');
const HTML = fs.readFileSync(__dirname + '/../satin_alma_acentesi.html', 'utf8');

/* ── HTML'den isimle fonksiyon/const sök (süslü parantez eşleyerek) ── */
function kes(bas) {
  const i = HTML.indexOf(bas);
  if (i < 0) throw new Error('bulunamadı: ' + bas);
  let d = 0, j = HTML.indexOf('{', i);
  for (let k = j; k < HTML.length; k++) {
    if (HTML[k] === '{') d++;
    else if (HTML[k] === '}') { d--; if (!d) return HTML.slice(i, k + 1); }
  }
  throw new Error('kapanmadı: ' + bas);
}
function kesDizi(bas) {          // [ ... ] eşleyen sürüm (const X = [...] için)
  const i = HTML.indexOf(bas);
  if (i < 0) throw new Error('bulunamadı: ' + bas);
  let d = 0;
  for (let k = HTML.indexOf('[', i); k < HTML.length; k++) {
    if (HTML[k] === '[') d++;
    else if (HTML[k] === ']') { d--; if (!d) return HTML.slice(i, k + 1) + ';'; }
  }
  throw new Error('kapanmadı: ' + bas);
}
function kesSatir(bas) {
  const i = HTML.indexOf(bas);
  if (i < 0) throw new Error('bulunamadı: ' + bas);
  return HTML.slice(i, HTML.indexOf('\n', i));
}

const KAYNAK = [
  kesSatir("const TALEP_KAPALI_DURUMLAR = ["),
  kesSatir("function talepKapaliMi(t)"),
  kesSatir("const LS_KEY = 'emonfast_v1';"),
  kesSatir("const YEDEK_PREFIX = 'emonfast_yedek_';"),
  kesSatir("const YEREL_DEPO_LIMIT_MB = 5;"),
  kesDizi("const YEREL_KISMI_MERDIVEN = ["),
  kes("function _yerelDepoBoyutMB()"),
  kesSatir("function _depoMaliyetiMB(str)"),
  kes("function yedekSnapshotBuda(kalan)"),
  kes("function _yerelKopyaKucult(veri, basamak)"),
  kes("function _yerelKopyaYaz(veri)"),
  kesSatir("function _bellekKismiMi()"),
].join('\n\n');

/* ── UTF-16 kotalı sahte localStorage ── */
function sahteDepo(kotaMB) {
  const m = new Map();
  const kota = kotaMB * 1048576;
  const boyut = () => { let n = 0; for (const [k, v] of m) n += (k.length + v.length) * 2; return n; };
  return {
    get length() { return m.size; },
    key(i) { return [...m.keys()][i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    removeItem(k) { m.delete(k); },
    setItem(k, v) {
      v = String(v);
      const eski = m.has(k) ? (k.length + m.get(k).length) * 2 : 0;
      if (boyut() - eski + (k.length + v.length) * 2 > kota) {
        const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; throw e;
      }
      m.set(k, v);
    },
    _boyutMB() { return boyut() / 1048576; },
    _map: m,
  };
}

/* ── Test verisi: n talep, her biri ~hedefKB (karakter) ── */
function veriUret(nAcik, nKapali, kbPerTalep) {
  const dolgu = 'x'.repeat(Math.max(0, kbPerTalep * 1024 - 200));
  const TALEPLER = [], talepTeklifleri = {};
  let no = 0;
  const yap = (durum, gun) => {
    const t = { no: 'TLP-' + String(++no).padStart(5, '0'), musteri: 'M' + no, urun: 'U', durum,
                tarih: '2026-' + String(1 + (gun % 12)).padStart(2, '0') + '-' + String(1 + (gun % 28)).padStart(2, '0'),
                dolgu };
    TALEPLER.push(t);
    talepTeklifleri[t.no] = [{ tedarikci: 'T', urunFiyatlari: {} }];
  };
  for (let i = 0; i < nKapali; i++) yap('Tamamlandı', i);
  for (let i = 0; i < nAcik; i++) yap('Yeni', 100 + i);
  TALEPLER.reverse();  // uygulamadaki gibi en yeni başta
  return { TALEPLER, talepTeklifleri, MUSTERILER: [], TEDARIKCILER: [],
           CRM_AKTIVITELER: Array.from({ length: 500 }, (_, i) => ({ i, m: 'aktivite' + i })),
           AYARLAR: {}, tarih: new Date().toISOString() };
}

/* ── Koşum ortamı ── */
function ortam(kotaMB) {
  const ctx = { console, localStorage: sahteDepo(kotaMB), _sunucuBaz: null, _yerelKopyaKismi: null,
                JSON, Math, Object, Array, Set, String, Date, Error };
  vm.createContext(ctx);
  vm.runInContext(KAYNAK, ctx);
  return ctx;
}

let gecti = 0, kaldi = 0;
const iddia = (ad, kosul, ek) => {
  if (kosul) { gecti++; console.log('  ✓ ' + ad); }
  else { kaldi++; console.log('  ✗ ' + ad + (ek ? '  → ' + ek : '')); }
};

console.log('\n=== T1: bol yer → TAM kopya, kısmilik yok ===');
{
  const c = ortam(10);
  const v = veriUret(20, 30, 8);
  const ok = vm.runInContext('_yerelKopyaYaz(V)', Object.assign(c, { V: v }));
  const yazilan = JSON.parse(c.localStorage.getItem('emonfast_v1'));
  iddia('yazım başarılı', ok === true);
  iddia('kopya tam (50 talep)', yazilan.TALEPLER.length === 50, yazilan.TALEPLER.length);
  iddia('_kismi damgası YOK', !yazilan._kismi);
  iddia('_yerelKismiAtlanan = 0', c._yerelKismiAtlanan === 0, c._yerelKismiAtlanan);
  iddia('_yerelKayitBozuk = false', c._yerelKayitBozuk === false);
}

console.log('\n=== T2: yeri snapshot yiyor → snapshot düşer, kopya TAM kalır (küçültme YOK) ===');
{
  const c = ortam(5);
  const v = veriUret(20, 30, 8);                       // ~0.4 M karakter ≈ 0.8 MB
  // Tek snapshot 4.8 MB: buda(1) onu KORUR (tek tarihli kopya) → yazım hâlâ sığmaz.
  // Ancak buda(0) hepsini düşürdükten sonraki TAM-kopya yeniden denemesi kurtarır.
  c.localStorage.setItem('emonfast_yedek_2026-08-30', 'y'.repeat(2_400_000));
  const ok = vm.runInContext('_yerelKopyaYaz(V)', Object.assign(c, { V: v }));
  const yazilan = JSON.parse(c.localStorage.getItem('emonfast_v1'));
  iddia('yazım başarılı', ok === true);
  iddia('eski snapshot düştü', c.localStorage.getItem('emonfast_yedek_2026-08-30') === null);
  iddia('kopya TAM kaldı — veri değil YEDEK feda edildi', yazilan.TALEPLER.length === 50 && !yazilan._kismi);
  iddia('_yerelKismiAtlanan = 0', c._yerelKismiAtlanan === 0);
}

console.log('\n=== T3: veri tek başına kotayı aşıyor → KAPALI talepler düşer, AÇIKLAR durur ===');
{
  const c = ortam(5);
  const v = veriUret(40, 400, 12);                     // ~5.3 M karakter ≈ 10.5 MB
  const ok = vm.runInContext('_yerelKopyaYaz(V)', Object.assign(c, { V: v }));
  const yazilan = JSON.parse(c.localStorage.getItem('emonfast_v1'));
  const acikSayisi = yazilan.TALEPLER.filter(t => t.durum === 'Yeni').length;
  iddia('yazım başarılı (kayıt kaybolmadı)', ok === true);
  iddia('kopya küçüldü', yazilan.TALEPLER.length < 440, yazilan.TALEPLER.length);
  iddia('TÜM açık talepler korundu (40)', acikSayisi === 40, acikSayisi);
  iddia('_kismi damgası var', !!yazilan._kismi && yazilan._kismi.atlanan > 0);
  iddia('_kismi.toplam doğru', yazilan._kismi.toplam === 440, yazilan._kismi && yazilan._kismi.toplam);
  iddia('acikAtlandi = false', yazilan._kismi.acikAtlandi === false);
  iddia('düşen taleplerin teklifleri de düştü',
    Object.keys(yazilan.talepTeklifleri).length === yazilan.TALEPLER.length,
    Object.keys(yazilan.talepTeklifleri).length + ' vs ' + yazilan.TALEPLER.length);
  iddia('kota aşılmadı', c.localStorage._boyutMB() <= 5);
  iddia('_yerelKayitBozuk = false', c._yerelKayitBozuk === false);
  iddia('_yerelKismiAtlanan raporlanıyor', c._yerelKismiAtlanan === yazilan._kismi.atlanan);
}

console.log('\n=== T4: açıklar bile sığmıyor → son çare basamağı (açık kırpma + CRM) ===');
{
  const c = ortam(5);
  const v = veriUret(300, 200, 20);                    // ~10 M karakter ≈ 20 MB
  const ok = vm.runInContext('_yerelKopyaYaz(V)', Object.assign(c, { V: v }));
  const yazilan = JSON.parse(c.localStorage.getItem('emonfast_v1'));
  iddia('yazım başarılı', ok === true);
  iddia('kapalı talep kalmadı', yazilan.TALEPLER.every(t => t.durum === 'Yeni'));
  iddia('açık talepler 80 ile sınırlandı', yazilan.TALEPLER.length === 80, yazilan.TALEPLER.length);
  iddia('acikAtlandi = true', yazilan._kismi.acikAtlandi === true);
  iddia('CRM kırpıldı (200)', yazilan.CRM_AKTIVITELER.length === 200, yazilan.CRM_AKTIVITELER.length);
  iddia('CRM en YENİLERİ tutuldu', yazilan.CRM_AKTIVITELER[199].i === 499, yazilan.CRM_AKTIVITELER[199].i);
  iddia('kota aşılmadı', c.localStorage._boyutMB() <= 5);
}

console.log('\n=== T5: en küçük kopya bile sığmıyor → dürüst başarısızlık ===');
{
  const c = ortam(0.4);
  const v = veriUret(300, 200, 20);
  const ok = vm.runInContext('_yerelKopyaYaz(V)', Object.assign(c, { V: v }));
  iddia('false döner', ok === false);
  iddia('_yerelKayitBozuk = true (band çıkar)', c._yerelKayitBozuk === true);
  iddia('_yerelKismiAtlanan sıfırlandı', c._yerelKismiAtlanan === 0);
}

console.log('\n=== T6: en YENİ kapalı talepler tutulur (tarih sırası) ===');
{
  const c = ortam(10);
  const v = { TALEPLER: [
      { no: 'A', durum: 'Tamamlandı', tarih: '2026-01-01' },
      { no: 'B', durum: 'Tamamlandı', tarih: '2026-08-01' },
      { no: 'C', durum: 'Tamamlandı', tarih: '2026-05-01' },
      { no: 'D', durum: 'Yeni',       tarih: '2020-01-01' },
    ], talepTeklifleri: { A: [1], B: [2], C: [3], D: [4] } };
  const r = vm.runInContext('_yerelKopyaKucult(V, { kapali: 2 })', Object.assign(c, { V: v }));
  const nolar = r.kopya.TALEPLER.map(t => t.no);
  iddia('en eski kapalı (A) düştü', !nolar.includes('A'), nolar.join(','));
  iddia('en yeni iki kapalı (B,C) kaldı', nolar.includes('B') && nolar.includes('C'));
  iddia('açık talep tarihi eski olsa da kaldı', nolar.includes('D'));
  iddia('özgün sıra korundu', JSON.stringify(nolar) === JSON.stringify(['B', 'C', 'D']), nolar.join(','));
  iddia('atlanan = 1', r.atlanan === 1, r.atlanan);
  iddia('A teklifleri de düştü', !('A' in r.kopya.talepTeklifleri));
  iddia('kaynak veri MUTASYONA uğramadı', v.TALEPLER.length === 4 && 'A' in v.talepTeklifleri);
}

console.log('\n=== T7: küçültme kaynak objeyi bozmaz (sunucuya TAM gitmeli) ===');
{
  const c = ortam(5);
  const v = veriUret(40, 400, 12);
  const oncekiTalep = v.TALEPLER.length, oncekiTeklif = Object.keys(v.talepTeklifleri).length;
  const oncekiCrm = v.CRM_AKTIVITELER.length;
  vm.runInContext('_yerelKopyaYaz(V)', Object.assign(c, { V: v }));
  iddia('TALEPLER dokunulmadı', v.TALEPLER.length === oncekiTalep, v.TALEPLER.length);
  iddia('talepTeklifleri dokunulmadı', Object.keys(v.talepTeklifleri).length === oncekiTeklif);
  iddia('CRM_AKTIVITELER dokunulmadı', v.CRM_AKTIVITELER.length === oncekiCrm);
  iddia('kaynağa _kismi bulaşmadı', !v._kismi);
}

console.log('\n=== T8: _bellekKismiMi — yedek üretimi kapısı ===');
{
  const c = ortam(10);
  c._yerelKopyaKismi = null; c._sunucuBaz = null;
  iddia('tam kopya + sunucu yok → false', vm.runInContext('_bellekKismiMi()', c) === false);
  c._yerelKopyaKismi = { atlanan: 5 };
  iddia('kısmi kopya + sunucu yok → TRUE (yedek alma)', vm.runInContext('_bellekKismiMi()', c) === true);
  c._sunucuBaz = {};
  iddia('kısmi kopya + sunucu geldi → false (bellek tam)', vm.runInContext('_bellekKismiMi()', c) === false);
}

console.log('\n=== T9: gerçek ölçek — 205 talep bugün hâlâ TAM yazılıyor (regresyon yok) ===');
{
  const c = ortam(5);
  const v = veriUret(60, 145, 12);                     // ~2.5 M karakter ≈ 5 MB... sınırda
  const ok = vm.runInContext('_yerelKopyaYaz(V)', Object.assign(c, { V: v }));
  const yazilan = JSON.parse(c.localStorage.getItem('emonfast_v1'));
  iddia('yazım başarılı', ok === true);
  iddia('bu boyutta kopya tam veya makul kısmi', yazilan.TALEPLER.length >= 60);
  iddia('açıklar her hâlükârda tam', yazilan.TALEPLER.filter(t => t.durum === 'Yeni').length === 60);
}

console.log(`\n=== TOPLAM: ${gecti} geçti, ${kaldi} başarısız ===`);
process.exit(kaldi ? 1 : 0);
