// EMON FAST — manuel RFQ teklif satırı: HAYALET/KLON üremesi regresyon testi
// Çalıştır: node tools/teklif-hayalet-test.js
//
// Olay (2026-09-09, TLP-00298 / TLP-00299): senkron merge'i teklif satırlarını
// TEDARİKÇİ ADIYLA anahtarlıyor ve union (noDelete) modunda. Manuel girişte ad
// kullanıcı tarafından yazıldığı için anahtar giriş boyunca değişiyor; her ara hâl
// sunucuda AYRI satır olarak birikiyordu (boş manuel satırlar + fiyatı bölünmüş
// kopyalar). Bu test gerçek fonksiyonları HTML'den çıkarıp o senaryoları sürer.
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'satin_alma_acentesi.html'), 'utf8');

function ekstrakt(fn) {
  const i = html.search(new RegExp('^function ' + fn + '\\(', 'm'));
  if (i < 0) throw new Error('bulunamadı: ' + fn);
  const out = [];
  for (const s of html.slice(i).split('\n')) { out.push(s); if (s === '}') break; }
  return out.join('\n');
}
function sabit(ad) {
  const m = html.match(new RegExp('^const ' + ad + ' = .*$', 'm'));
  if (!m) throw new Error('sabit bulunamadı: ' + ad);
  return m[0];
}

// ── ortam taklidi (fonksiyonların dokunduğu global'ler) ──
let aktifKullanici = { rol: 'admin', ad: 'selim' }, _sunucuBaz = {};
let _silinenTalepNolar = new Set(), _silinenMusteriFirmalar = new Set(),
    _silinenTedarikciKeyler = new Set(), _silinenCrmIdler = new Set(),
    _silinenTeklifSatir = new Set();
let TALEPLER = [{ no: 'TLP-00299', miktar: 1 }], aktifTalepIdx = 0;
let talepTeklifleri = {};
const document = { getElementById: () => null };
const teklifleriKarsilastir = () => {};
const renderTalepTeklifleri = () => {};
const showToast = () => {};
const veriKaydet = () => {};

const FNS = ['_canon', '_mkey', '_kayitBirlestir', '_mergeDizi', '_mergeObje',
             '_tkDoluDeger', '_tkIcerikVar', '_tkHayaletMi', '_teklifHayaletAyikla',
             '_tkBayatKopyaMi', '_tkKlonIndeksleri',
             '_teklifSilmeAnahtari', 'talepTeklifGuncelle'];
eval([sabit('_TK_KIMLIK_ALAN'), sabit('_TK_KIYAS_HARIC'), ...FNS.map(ekstrakt)].join('\n\n'));

const clone = o => JSON.parse(JSON.stringify(o));
let pass = 0, fail = 0; const fails = [];
function ok(c, msg) { if (c) pass++; else { fail++; fails.push(msg); console.log('  ✗ FAIL:', msg); } }
const ozet = a => (a || []).map(r => (r.tedarikci || '(BOŞ)') + JSON.stringify(r.urunFiyatlari || {})).join(' ');

// ── senkron döngüsü taklidi: _veriPush'un talepTeklifleri kısmı + tazeleme (pull) ──
let sunucu, baz;
function sifirla(baslangic) {
  sunucu = clone(baslangic || {}); baz = clone(sunucu); talepTeklifleri = clone(sunucu);
  _silinenTeklifSatir = new Set();
}
function kaydet() {
  const gonderilecek = _mergeObje(baz, talepTeklifleri, sunucu, new Set(), _silinenTeklifSatir);
  _teklifHayaletAyikla(gonderilecek);            // _veriPush'taki ayıklama
  sunucu = clone(gonderilecek); baz = clone(gonderilecek);
  _silinenTeklifSatir.clear();                   // başarılı kayıt sonrası temizlenir
}
function tazele() {                              // apiVeriYukle: sunucu → yerel
  const gelen = clone(sunucu);
  const taslaklar = {};
  Object.keys(talepTeklifleri).forEach(no => {
    taslaklar[no] = (talepTeklifleri[no] || []).filter(tk => tk && tk._taslak && _tkHayaletMi(tk));
  });
  Object.keys(gelen).forEach(no => { if (taslaklar[no]?.length) gelen[no] = gelen[no].concat(taslaklar[no]); });
  talepTeklifleri = Object.assign(clone(talepTeklifleri), gelen);
  baz = clone(sunucu);
}
// Kullanıcı manuel satır açar (yeniTeklifSatirEkle'nin taslak dalı)
function satirAc(no, ad) {
  (talepTeklifleri[no] = talepTeklifleri[no] || []).push({
    tedarikci: ad || '', _manuelMod: !ad, _taslak: !ad,
    birimFiyat: 0, urunFiyatlari: {}, teslimat: '', gecerlilik: '', odeme: '', not: '', webLink: ''
  });
  if (ad) kaydet();
}
const adYaz = (i, ad) => talepTeklifGuncelle(i, 'tedarikci', ad);   // GERÇEK fonksiyon
function fiyatGir(no, i, uIdx, fiyat) {
  const tk = talepTeklifleri[no][i];
  tk.urunFiyatlari['fiyat_' + uIdx] = fiyat;
  tk.urunFiyatlari['fiyat_' + uIdx + '_ham'] = fiyat;
  tk.urunFiyatlari['fiyat_' + uIdx + '_para'] = 'TRY';
  const f = Object.entries(tk.urunFiyatlari).filter(([k]) => /^fiyat_\d+$/.test(k)).map(([, v]) => v);
  tk.birimFiyat = f.reduce((a, b) => a + b, 0) / f.length;
}
const N = 'TLP-00299';

console.log('=== MANUEL RFQ GİRİŞİ: HAYALET SATIR ÜREMESİ ===');

// 1) Yeni boş satır sunucuya yazılmaz, ad yazılırken ara hâller birikmez
sifirla({ [N]: [] });
satirAc(N);
kaydet();
ok((sunucu[N] || []).length === 0, '1a) boş taslak satır sunucuya YAZILMAZ (yazıldı: ' + ozet(sunucu[N]) + ')');
tazele();
ok(talepTeklifleri[N].length === 1, '1b) taslak satır tazelemede EKRANDA KALIR');
adYaz(0, 'ANI'); kaydet(); tazele();          // debounce ortasında kayıt
adYaz(0, 'ANIL TEL'); kaydet(); tazele();
adYaz(0, 'ANIL TELEKOM'); fiyatGir(N, 0, 0, 1500); kaydet(); tazele();
ok(sunucu[N].length === 1, '1c) yazım boyunca TEK satır kalır (oluşan: ' + ozet(sunucu[N]) + ')');
ok(sunucu[N][0].tedarikci === 'ANIL TELEKOM' && sunucu[N][0].urunFiyatlari.fiyat_0 === 1500,
   '1d) satırın adı ve fiyatı doğru (' + ozet(sunucu[N]) + ')');
ok(!('_taslak' in sunucu[N][0]), '1e) _taslak bayrağı ortak veriye sızmaz');

// 2) Fiyatı GİRİLMİŞ satırın adı düzeltilince satır klonlanmaz (TLP-00298)
sifirla({ [N]: [{ tedarikci: 'ANIL TELEKOM', _manuelMod: true, birimFiyat: 1500,
                  urunFiyatlari: { fiyat_0: 1500, fiyat_0_ham: 1500, fiyat_0_para: 'TRY' },
                  teslimat: '', gecerlilik: '', odeme: '', not: '', webLink: '' }] });
adYaz(0, 'ANIL TELEKOM A.Ş.'); kaydet(); tazele();
fiyatGir(N, 0, 1, 2300); kaydet(); tazele();
ok(sunucu[N].length === 1, '2a) ad düzeltmesi satırı KLONLAMAZ (oluşan: ' + ozet(sunucu[N]) + ')');
ok(sunucu[N][0].urunFiyatlari.fiyat_0 === 1500 && sunucu[N][0].urunFiyatlari.fiyat_1 === 2300,
   '2b) iki kalemin fiyatı AYNI satırda (bölünmedi): ' + ozet(sunucu[N]));

// 3) Geri-yazım (backspace): önceki bir ada dönmek satırı sildirmez
sifirla({ [N]: [] });
satirAc(N);
adYaz(0, 'ANI'); adYaz(0, 'ANIL'); adYaz(0, 'ANI');   // harf sildi
fiyatGir(N, 0, 0, 990);
kaydet(); tazele();
ok(sunucu[N].length === 1 && sunucu[N][0].tedarikci === 'ANI',
   '3) backspace ile eski ada dönünce satır KAYBOLMAZ (' + ozet(sunucu[N]) + ')');

// 4) Sunucuda birikmiş hayaletler ilk kayıtta temizlenir
sifirla({ [N]: [
  { tedarikci: '', _manuelMod: true, birimFiyat: 0, urunFiyatlari: {}, teslimat: '', odeme: '', not: '' },
  { tedarikci: '', _manuelMod: true, birimFiyat: 0, urunFiyatlari: {}, teslimat: '', odeme: '', not: '' },
  { tedarikci: 'PENTA', birimFiyat: 100, urunFiyatlari: { fiyat_0: 100 } },
] });
kaydet();
ok(sunucu[N].length === 1 && sunucu[N][0].tedarikci === 'PENTA',
   '4) adsız+içeriksiz eski hayaletler temizlenir, dolu satır durur (' + ozet(sunucu[N]) + ')');

// 5) Adsız ama FİYATLI satır (önce fiyat, sonra ad giren kullanıcı) korunur
sifirla({ [N]: [{ tedarikci: '', _manuelMod: true, birimFiyat: 250, urunFiyatlari: { fiyat_0: 250 } }] });
kaydet();
ok(sunucu[N].length === 1, '5) adsız ama fiyatlı satır SİLİNMEZ (' + ozet(sunucu[N]) + ')');

// 6) İki kullanıcı aynı talebe farklı tedarikçi girerse ikisi de yaşar (regresyon)
sifirla({ [N]: [{ tedarikci: 'PENTA', birimFiyat: 100, urunFiyatlari: { fiyat_0: 100 } }] });
const digerCihaz = clone(sunucu);
digerCihaz[N].push({ tedarikci: 'OKSİD', birimFiyat: 120, urunFiyatlari: { fiyat_0: 120 } });
sunucu = clone(digerCihaz);                                  // diğer cihaz önce yazdı
satirAc(N); adYaz(0 + 1, 'DESPEC');                          // bu cihaz kendi satırını açtı
fiyatGir(N, 1, 0, 95);
kaydet();
const adlar = sunucu[N].map(r => r.tedarikci).sort();
ok(adlar.join(',') === 'DESPEC,OKSİD,PENTA', '6) eşzamanlı farklı tedarikçiler KAYBOLMAZ (' + adlar.join(',') + ')');

console.log('  → ' + pass + ' geçti, ' + fail + ' başarısız');

console.log('\n=== BAYAT KOPYA (KLON) TESPİTİ ===');
const L1 = [
  { tedarikci: 'ANI', urunFiyatlari: { fiyat_0: 1500, fiyat_0_ham: 1500, fiyat_0_para: 'TRY' } },
  { tedarikci: 'ANIL TELEKOM', urunFiyatlari: { fiyat_0: 1500, fiyat_0_ham: 1500, fiyat_0_para: 'TRY', fiyat_1: 2300 } },
];
ok(JSON.stringify(_tkKlonIndeksleri(L1)) === '[0]', 'k1) yarım adlı + fiyatı alt küme satır KLON işaretlenir');

const L2 = [
  { tedarikci: 'PENTA', urunFiyatlari: { fiyat_0: 1500 } },
  { tedarikci: 'PENTA', urunFiyatlari: { fiyat_0: 1490, fiyat_0_alt: 'muadil ürün' } },
];
ok(_tkKlonIndeksleri(L2).length === 0, 'k2) aynı tedarikçinin FARKLI fiyatlı muadil satırı klon SAYILMAZ');

const L3 = [
  { tedarikci: 'PENTA', urunFiyatlari: { fiyat_0: 1500 } },
  { tedarikci: 'PENTA', urunFiyatlari: { fiyat_0: 1500 } },
];
ok(JSON.stringify(_tkKlonIndeksleri(L3)) === '[0]', 'k3) birebir aynı iki satırdan yalnız BİRİ klon (biri hayatta kalır)');

const L4 = [
  { tedarikci: 'PEN', urunFiyatlari: {} },
  { tedarikci: 'PENTA', urunFiyatlari: { fiyat_0: 1500 } },
  { tedarikci: 'OKSİD', urunFiyatlari: { fiyat_0: 1500 } },
];
ok(JSON.stringify(_tkKlonIndeksleri(L4)) === '[0]', 'k4) farklı tedarikçi (aynı fiyat) klon SAYILMAZ');

const L5 = [
  { tedarikci: 'PENTA', urunFiyatlari: { fiyat_0: 1500 }, not: 'stokta yok' },
  { tedarikci: 'PENTA', urunFiyatlari: { fiyat_0: 1500 } },
];
// Notlu satır ZENGİN olan: bilgisi ONUN İÇİNDE eriyen çıplak kopya silinir, notlu satır kalır.
ok(JSON.stringify(_tkKlonIndeksleri(L5)) === '[1]', 'k5) bilgi kaybı olmayan taraf silinir (notlu satır korunur)');

const L6 = [{ tedarikci: 'PENTA', urunFiyatlari: {} }, { tedarikci: 'PENTA', urunFiyatlari: {} }];
ok(JSON.stringify(_tkKlonIndeksleri(L6)) === '[0]', 'k6) aynı adlı iki BOŞ satırdan biri klon (biri kalır)');

const L7 = [{ tedarikci: '', urunFiyatlari: { fiyat_0: 250 } }, { tedarikci: 'PENTA', urunFiyatlari: { fiyat_0: 250 } }];
ok(JSON.stringify(_tkKlonIndeksleri(L7)) === '[0]', 'k7) adsız ama aynı fiyatlı satır, adlı satırın kopyası sayılır');

console.log('  → toplam ' + pass + ' geçti, ' + fail + ' başarısız');
console.log('\n=== TOPLAM: ' + pass + ' geçti, ' + fail + ' başarısız ===');
if (fail) { console.log('BAŞARISIZLAR:'); fails.forEach(f => console.log(' -', f)); }
process.exit(fail ? 1 : 0);
