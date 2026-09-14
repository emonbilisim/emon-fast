// EMON FAST — "Satış Fiyatlama" tablosu teklif değişince tazeleniyor mu? (TLP-00307)
// Çalıştır: node tools/satis-tablosu-tazele-test.js
//
// Olay (2026-09-14): elle girilen tedarikçi teklifi KARŞILAŞTIRMA tablosuna anında
// düşüyor, ama altındaki "Satış Fiyatlama" tablosunda hiç görünmüyordu. Neden: teklif
// girişi yalnız teklifleriKarsilastir() çağırıyordu; satış tablosu talep açıldığı
// andaki hâliyle BAYAT kalıyor, ancak talep kapatılıp açılınca (ya da satış bölümünde
// bir alana dokununca) yeniden hesaplanıyordu.
//
// Test, gerçek fonksiyonları HTML'den çıkarıp asgari bir DOM taklidiyle sürer.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'satin_alma_acentesi.html'), 'utf8');

function ekstrakt(fn) {
  const i = html.search(new RegExp('^function ' + fn + '\\(', 'm'));
  if (i < 0) throw new Error('bulunamadı: ' + fn);
  const out = [];
  for (const s of html.slice(i).split('\n')) { out.push(s); if (s === '}') break; }
  return out.join('\n');
}
function satirlar(re) {
  const m = html.match(re);
  if (!m) throw new Error('bulunamadı: ' + re);
  return m[0];
}

// ── asgari DOM taklidi ──
function yeniTd() {
  return { style: { cssText: '' }, dataset: {}, innerHTML: '', textContent: '' };
}
function yeniTr() {
  const tr = { style: {}, dataset: {}, cells: [] };
  tr.insertCell = () => { const td = yeniTd(); tr.cells.push(td); return td; };
  return tr;
}
function yeniTbody() {
  const o = { rows: [], insertRow() { const tr = yeniTr(); o.rows.push(tr); return tr; } };
  Object.defineProperty(o, 'innerHTML', { get: () => '', set() { o.rows.length = 0; } });
  return o;
}
let DOM = {};
function domKur(deger) {
  DOM = {
    'satis-urun-tbody':    yeniTbody(),
    'satis-toplam':        { innerHTML: '', textContent: '' },
    'satis-kdv-notu':      { textContent: '' },
    'satis-kdv':           { value: '0' },
    'ikinci-fiyat-cb':     { checked: false },
    'satis-toplu-iskonto': { value: '' },
    'satis-nakliye':       { value: '' },
    'satis-nakliye-para':  { value: 'USD' },
    'satis-manuel-kur-cb': { checked: false },
    'satis-manuel-kur':    { value: '' },
    'satis-manuel-kur-eur':{ value: '' },
    'satis-tek-doviz':     { value: '' },
  };
  Object.assign(DOM, deger || {});
}
const document = { getElementById: id => DOM[id] || null };
const window = {};

// ── fonksiyonların dokunduğu global'ler ──
let TALEPLER = [], aktifTalepIdx = 0, talepTeklifleri = {};
let satisUrunMarjlari = {}, satisUrunBaz = {}, satisToplamPara = null;
let dovizKurlari = { usdSatis: 40, eurSatis: 45 };
let AYARLAR = { standartKargoUSD: 0 };
let MUSTERILER = [], FP_KURALLAR = { baz: 25 };
let TEDARIKCILER = [];
const tedKondisyonSatiri = () => null;     // kondisyon yok → maliyet = ham fiyat
let paraModalSayaci = 0;
const satisParaSecModal = () => { paraModalSayaci++; };
let karsSayaci = 0;
const teklifleriKarsilastir = () => { karsSayaci++; };
const veriKaydet = () => {};
const showToast = () => {};

const FNS = ['tedSiparisToplamTL', 'gercekMaliyetHesapla', 'toplamBirimMaliyetTL',
             'satisTablosunuTazele', 'satisHesaplaTablosu', 'talepTeklifUrunFiyatGuncelle'];
eval([
  satirlar(/^let _satisAktifTalepNo = .*$/m),
  satirlar(/^let _satisTazeleTimer {2}= .*$/m),
  ...FNS.map(ekstrakt),
].join('\n\n'));

let pass = 0, fail = 0; const fails = [];
function ok(c, msg) { if (c) pass++; else { fail++; fails.push(msg); console.log('  ✗ FAIL:', msg); } }
// Satış tablosundaki bir satırın "Tedarikçi / Maliyet" hücresi
const tedHucresi = r => (r?.cells?.find(c => c.dataset.label === 'Tedarikçi / Maliyet')?.innerHTML) || '';
const bekle = ms => new Promise(r => setTimeout(r, ms));

function talepKur() {
  TALEPLER = [{ no: 'TLP-00307', musteri: 'ACME', urunler: [
    { aciklama: 'SWITCH 24 PORT', adet: 2, birim: 'Adet', kargoModu: 'yok' },
  ] }];
  aktifTalepIdx = 0;
  talepTeklifleri = { 'TLP-00307': [
    { tedarikci: 'PAHALI A.Ş.', birimFiyat: 10000, urunFiyatlari: { fiyat_0: 10000, fiyat_0_ham: 10000, fiyat_0_para: 'TRY' } },
  ] };
  satisUrunMarjlari = {}; satisUrunBaz = {}; satisToplamPara = null;
  _satisAktifTalepNo = null;
  domKur();
}

(async () => {
console.log('\n═══ TLP-00307 — satış fiyatlama tablosu teklifle birlikte tazeleniyor mu ═══\n');

// ── 1) ASIL OLAY: talep açıkken elle girilen ucuz teklif satış tablosuna düşer ──
{
  talepKur();
  satisHesaplaTablosu();                                  // talep açılışı
  ok(DOM['satis-urun-tbody'].rows.length === 1, '1a: satış tablosu açılışta hesaplandı');
  ok(/PAHALI/.test(tedHucresi(DOM['satis-urun-tbody'].rows[0])), '1b: açılışta tek teklif seçili');

  // Kullanıcı elle yeni tedarikçi satırı açıp fiyat yazıyor (oninput → her tuşta)
  talepTeklifleri['TLP-00307'].push({ tedarikci: 'ANIL TELEKOM', birimFiyat: 0, urunFiyatlari: {} });
  '4000'.split('').reduce((acc, ch) => {
    const v = acc + ch;
    talepTeklifUrunFiyatGuncelle(1, 0, v, 'TRY');
    return v;
  }, '');
  ok(karsSayaci >= 4, '1c: karşılaştırma tablosu her tuşta tazelendi (eski davranış korundu)');

  await bekle(400);                                       // tazeleme debounce'u
  const h = tedHucresi(DOM['satis-urun-tbody'].rows[0]);
  ok(/ANIL TELEKOM/.test(h), '1d: elle girilen UCUZ teklif satış tablosuna düştü (TLP-00307)');
  ok(!/PAHALI/.test(h), '1e: eski pahalı tedarikçi artık seçili değil');
  ok(DOM['satis-urun-tbody'].rows.length === 1, '1f: satır sayısı ürün sayısı kadar kaldı');
}

// ── 2) Teklif silinince de tazelenir (satır silme renderTalepTeklifleri'den geçer) ──
{
  talepKur();
  talepTeklifleri['TLP-00307'].push({ tedarikci: 'ANIL TELEKOM', birimFiyat: 4000, urunFiyatlari: { fiyat_0: 4000, fiyat_0_ham: 4000, fiyat_0_para: 'TRY' } });
  satisHesaplaTablosu();
  ok(/ANIL TELEKOM/.test(tedHucresi(DOM['satis-urun-tbody'].rows[0])), '2a: ucuz olan seçili');
  talepTeklifleri['TLP-00307'].splice(1, 1);              // talepTeklifSil
  satisTablosunuTazele();
  await bekle(400);
  ok(/PAHALI/.test(tedHucresi(DOM['satis-urun-tbody'].rows[0])), '2b: silinince maliyet tekrar hesaplandı');
}

// ── 3) GÜVENLİK: tablo başka talep için hesaplanmışsa tazeleme ÇALIŞMAZ ──
//    (talepDetayAc, marjları sıfırlamadan önce renderTalepTeklifleri çağırıyor;
//     o ilk render önceki talebin marjlarıyla tablo kurmamalı)
{
  talepKur();
  satisHesaplaTablosu();
  const oncekiHtml = tedHucresi(DOM['satis-urun-tbody'].rows[0]);
  TALEPLER.push({ no: 'TLP-00999', musteri: 'ACME', urunler: [{ aciklama: 'X', adet: 1, kargoModu: 'yok' }] });
  aktifTalepIdx = 1;
  talepTeklifleri['TLP-00999'] = [{ tedarikci: 'BAŞKA FİRMA', birimFiyat: 7, urunFiyatlari: { fiyat_0: 7, fiyat_0_ham: 7, fiyat_0_para: 'TRY' } }];
  satisTablosunuTazele();
  await bekle(400);
  ok(tedHucresi(DOM['satis-urun-tbody'].rows[0]) === oncekiHtml, '3a: başka talebin tablosu ezilmedi');
  ok(!/BAŞKA FİRMA/.test(tedHucresi(DOM['satis-urun-tbody'].rows[0])), '3b: yeni talebin teklifi sızmadı');
}

// ── 4) Tablo hiç hesaplanmamışsa (ör. döviz seçimi bekliyor) tazeleme sessiz geçer ──
{
  talepKur();
  _satisAktifTalepNo = null;
  satisTablosunuTazele();
  await bekle(400);
  ok(DOM['satis-urun-tbody'].rows.length === 0, '4a: hesaplanmamış tablo kendiliğinden kurulmadı');
}

// ── 5) Karışık dövizde: elle giriş MODAL AÇMAZ, açılış açar ──
{
  talepKur();
  // İki kalem: birincisi TRY fiyatlı, ikincisi elle USD girilecek → karışık döviz
  TALEPLER[0].urunler.push({ aciklama: 'SFP MODÜL', adet: 4, birim: 'Adet', kargoModu: 'yok' });
  satisHesaplaTablosu();                                  // tek döviz (TRY) — modal yok
  ok(paraModalSayaci === 0, '5a: tek para biriminde modal yok');
  // USD'li ikinci teklif elle giriliyor → tazeleme modal ATMAMALI
  talepTeklifleri['TLP-00307'].push({ tedarikci: 'USD FİRMA', birimFiyat: 0, urunFiyatlari: {} });
  talepTeklifUrunFiyatGuncelle(1, 1, '50', 'USD');
  await bekle(400);
  ok(paraModalSayaci === 0, '5b: yazarken para birimi modalı AÇILMADI');
  ok(/USD FİRMA/.test(tedHucresi(DOM['satis-urun-tbody'].rows[1])), '5c: USD teklif yine de tabloya düştü');
  // Talebi yeniden açmak (normal çağrı) hâlâ soruyor
  satisToplamPara = null;
  satisHesaplaTablosu();
  ok(paraModalSayaci === 1, '5d: normal hesaplamada para birimi hâlâ soruluyor');
}

// ── 6) Karşılaştırma filtresi: fiyatı olan ama birimFiyat'ı 0 kalmış satır elenmiyor ──
{
  const kod = satirlar(/^ {2}const _fiyatliSatir = [\s\S]*?\n {4}\|\| .*$/m);
  let _fiyatliSatir; eval(kod.replace(/^ {2}const/, '_fiyatliSatir = '));
  ok(_fiyatliSatir({ birimFiyat: 5, urunFiyatlari: {} }), '6a: birimFiyat > 0 → gösterilir');
  ok(_fiyatliSatir({ birimFiyat: 0, urunFiyatlari: { fiyat_2: 1200, fiyat_2_para: 'TRY' } }),
     '6b: birimFiyat 0 ama ürün fiyatı var → gösterilir (eski ÖLÜ filtre eliyordu)');
  ok(!_fiyatliSatir({ birimFiyat: 0, urunFiyatlari: { fiyat_0_not: 'stokta yok' } }),
     '6c: yalnız not/muadil taşıyan fiyatsız satır gösterilmez');
  ok(!_fiyatliSatir({ birimFiyat: 0, urunFiyatlari: {} }), '6d: bomboş satır gösterilmez');
}

console.log('\n─────────────────────────────');
console.log(fail === 0 ? `✅ TÜMÜ GEÇTİ — ${pass} kontrol` : `❌ ${fail} BAŞARISIZ / ${pass} geçti`);
if (fail) { fails.forEach(f => console.log('   • ' + f)); process.exit(1); }
})();
