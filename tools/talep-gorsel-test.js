// EMON FAST — talep görselleri (RFQ referans görselleri) regresyon testi
// Çalıştır: node tools/talep-gorsel-test.js
// Gerçek fonksiyonları satin_alma_acentesi.html'den çıkarıp sürer.
// İnvariantlar:
//   1) b64 ASLA ana senkron blob'una girmez (blob şişmesi + her kayıtta yeniden upload)
//   2) Görsel meta'sı çok-kullanıcılı merge'de kaybolmaz
//   3) Mail ekleri Graph şemasına uygun + gövdedeki cid ile birebir eşleşir
//   4) Fetch hatası (null) meta'yı SİLMEZ
const fs = require('fs'), path = require('path');
const HTML = path.join(__dirname, '..', 'satin_alma_acentesi.html');
const html = fs.readFileSync(HTML, 'utf8');

function ekstrakt(fn) {
  const re = new RegExp('^function ' + fn + '\\(', 'm');
  const i = html.search(re);
  if (i < 0) throw new Error('bulunamadı: ' + fn);
  const satirlar = html.slice(i).split('\n');
  const out = [];
  for (const s of satirlar) { out.push(s); if (s === '}') break; }
  return out.join('\n');
}

const MERGE_FNS = ['_canon', '_mkey', '_kayitBirlestir', '_mergeDizi', '_mergeMusteriler', '_mergeObje', '_adminSahipli', '_onayKey', '_mergeKaydet'];
const GORSEL_FNS = ['_gorevEsc', 'talepBlobGuvenli', 'talepGorselMetaBirlestir', 'mailGorselEkleri', 'gorselB64Ayir'];
let aktifKullanici = { rol: 'admin', ad: 'selim' }, _sunucuBaz = {};
let _silinenTalepNolar = new Set(), _silinenMusteriFirmalar = new Set(), _silinenTedarikciKeyler = new Set(), _silinenCrmIdler = new Set(), _silinenTeklifSatir = new Set();
let TALEPLER = [];
eval([...MERGE_FNS, ...GORSEL_FNS].map(ekstrakt).join('\n\n'));

const clone = o => JSON.parse(JSON.stringify(o));
let pass = 0, fail = 0; const fails = [];
function ok(c, msg) { if (c) { pass++; } else { fail++; fails.push(msg); console.log('  ✗ FAIL:', msg); } }

const bos = () => ({
  TALEPLER: [], MUSTERILER: [], TEDARIKCILER: [], CRM_AKTIVITELER: [],
  ONAY_BEKLEYENLER: { musteriler: [], tedarikciler: [], _tombstone: {} },
  talepTeklifleri: {}, TALEP_TOMBSTONE: {}, KULLANICILAR: [], AYARLAR: {}, FP_KURALLAR: [],
  talepSayac: 0, crmSayac: 0
});
const push = (local, server, base) => _mergeKaydet(clone(local), clone(server), clone(base), false);
const meta = (id) => ({ id, ad: id + '.jpg', tip: 'image/jpeg', boyut: 1000 });
const tam  = (id) => ({ id, ad: id + '.jpg', tip: 'image/jpeg', boyut: 1000, b64: 'AAAA' });

console.log('=== 1) b64 SIZINTI KORUMASI (talepBlobGuvenli) ===');
{
  TALEPLER = [{ no: 'T-1', urun: 'A', gorseller: [tam('g1'), tam('g2')] }];
  const blob = talepBlobGuvenli();
  const s = JSON.stringify(blob);
  ok(!s.includes('b64'), '1a: b64 anahtarı blob\'a girmedi');
  ok(!s.includes('AAAA'), '1b: base64 içeriği blob\'a girmedi');
  ok(blob[0].gorseller.length === 2, '1c: meta korundu (2 görsel)');
  ok(blob[0].gorseller[0].ad === 'g1.jpg' && blob[0].gorseller[0].tip === 'image/jpeg', '1d: meta alanları (ad/tip) korundu');
  ok(TALEPLER[0].gorseller[0].b64 === 'AAAA', '1e: bellekteki asıl kayıt bozulmadı (yalnız kopya temizlenir)');
}
{
  TALEPLER = [{ no: 'T-1', urun: 'A' }, { no: 'T-2', gorseller: [] }];
  const blob = talepBlobGuvenli();
  ok(blob.length === 2 && !blob[0].gorseller, '1f: görselsiz talep bozulmadı');
}

console.log('=== 2) ÇOK-KULLANICILI MERGE (meta kaybolmamalı) ===');
{
  // Bayat istemci gorseller alanını hiç görmedi → sunucudakini EZMEMELİ
  const base   = bos(); base.TALEPLER   = [{ no: 'T-1', urun: 'A' }];
  const server = bos(); server.TALEPLER = [{ no: 'T-1', urun: 'A', gorseller: [meta('g1')] }];  // B görsel ekledi
  const local  = bos(); local.TALEPLER  = [{ no: 'T-1', urun: 'A' }];                            // A görmedi, başka iş yaptı
  local.TALEPLER[0].not = 'düzenleme';
  const r = push(local, server, base);
  const t = r.TALEPLER.find(x => x.no === 'T-1');
  ok(t && (t.gorseller || []).length === 1, '2a: bayat istemci başkasının görselini düşürmedi');
  ok(t && t.not === 'düzenleme', '2b: bayat istemcinin kendi düzenlemesi korundu');
}
{
  // Yerelde eklenen görsel sunucuya gitmeli
  const base   = bos(); base.TALEPLER   = [{ no: 'T-1', urun: 'A', gorseller: [] }];
  const server = bos(); server.TALEPLER = [{ no: 'T-1', urun: 'A', gorseller: [] }];
  const local  = bos(); local.TALEPLER  = [{ no: 'T-1', urun: 'A', gorseller: [meta('g1')] }];
  const r = push(local, server, base);
  ok(r.TALEPLER[0].gorseller.length === 1, '2c: yerelde eklenen görsel merge sonrası korundu');
}
{
  // Kasıtlı silme: local'de MEVCUT + base'den farklı → local kazanmalı
  const base   = bos(); base.TALEPLER   = [{ no: 'T-1', urun: 'A', gorseller: [meta('g1')] }];
  const server = bos(); server.TALEPLER = [{ no: 'T-1', urun: 'A', gorseller: [meta('g1')] }];
  const local  = bos(); local.TALEPLER  = [{ no: 'T-1', urun: 'A', gorseller: [] }];
  const r = push(local, server, base);
  ok(r.TALEPLER[0].gorseller.length === 0, '2d: kasıtlı görsel silme senkronlandı (geri gelmedi)');
}

console.log('=== 3) META BİRLEŞTİRME (union — yokluk SİLME değildir) ===');
{
  const t = { no: 'T-1', gorseller: [meta('g1')] };
  const degisti = talepGorselMetaBirlestir(t, [tam('g1'), tam('g2')]);   // başka cihaz g2 eklemiş
  ok(degisti === true, '3a: yeni görsel varsa değişti=true');
  ok(t.gorseller.length === 2, '3b: eşzamanlı eklenen görsel meta\'ya geri kazandırıldı');
  ok(!('b64' in t.gorseller[1]), '3c: birleştirme meta\'ya b64 sızdırmadı');
}
{
  const t = { no: 'T-1', gorseller: [meta('g1')] };
  ok(talepGorselMetaBirlestir(t, [tam('g1')]) === false, '3d: yeni yoksa değişti=false (gereksiz kayıt yok)');
}
{
  // KRİTİK: fetch hatası (null) meta'yı SİLMEMELİ
  const t = { no: 'T-1', gorseller: [meta('g1'), meta('g2')] };
  ok(talepGorselMetaBirlestir(t, null) === false && t.gorseller.length === 2, '3e: fetch hatasında (null) meta korundu');
}
{
  // KRİTİK REGRESYON: boş liste "hepsi silinmiş" DEĞİLDİR.
  // Talep no'su değişmiş olabilir (talepNoKesinlestir: geçici → kesin) → görseller
  // eski no altındadır ve yeni no ile sorgu [] döner. Eskiden bu meta'yı siliyordu.
  const t = { no: 'T-2', gorseller: [meta('g1'), meta('g2')] };
  ok(talepGorselMetaBirlestir(t, []) === false && t.gorseller.length === 2,
     '3f: boş liste meta\'yı SİLMEDİ (no değişimi sessiz veri kaybına yol açmıyor)');
}
{
  // Union sırayı korumalı, mükerrer üretmemeli
  const t = { no: 'T-1', gorseller: [meta('g2')] };
  talepGorselMetaBirlestir(t, [tam('g1'), tam('g2'), tam('g3')]);
  const idler = t.gorseller.map(g => g.id);
  ok(new Set(idler).size === idler.length, '3g: mükerrer meta üretilmedi');
  ok(idler.length === 3, '3h: eksik olanlar eklendi (g2 korundu, g1+g3 geldi)');
}

console.log('=== 4) MAIL EKLERİ (Graph şeması + cid eşleşmesi) ===');
{
  const r = mailGorselEkleri([tam('g1'), tam('g2')]);
  ok(r.ekler.length === 2, '4a: her görsel için bir ek');
  ok(r.ekler.every(e => e['@odata.type'] === '#microsoft.graph.fileAttachment'), '4b: Graph fileAttachment tipi doğru');
  ok(r.ekler.every(e => e.contentBytes === 'AAAA' && e.contentType === 'image/jpeg'), '4c: contentBytes/contentType doğru');
  ok(r.ekler.every(e => e.isInline === true && e.contentId), '4d: inline + contentId var (gövdede görünür)');
  // Gövdedeki her cid: gerçek bir ekle eşleşmeli — yoksa kırık görsel ikonu gider
  const cidler = [...r.html.matchAll(/cid:([a-z0-9]+)/g)].map(m => m[1]);
  ok(cidler.length === 2, '4e: gövdede 2 cid referansı');
  ok(cidler.every(c => r.ekler.some(e => e.contentId === c)), '4f: gövdedeki her cid bir eke karşılık geliyor');
  ok(new Set(r.ekler.map(e => e.contentId)).size === 2, '4g: contentId\'ler benzersiz');
}
{
  const r = mailGorselEkleri([]);
  ok(r.ekler.length === 0 && r.html === '', '4h: görsel yoksa ek/HTML üretilmez');
  const r2 = mailGorselEkleri(undefined);
  ok(r2.ekler.length === 0 && r2.html === '', '4i: undefined güvenli');
  // b64'süz (çekilememiş) kayıt maile kırık görsel olarak GİRMEMELİ
  const r3 = mailGorselEkleri([meta('g1'), tam('g2')]);
  ok(r3.ekler.length === 1 && r3.ekler[0].contentBytes === 'AAAA', '4j: b64\'süz kayıt elendi (kırık görsel gitmez)');
}

{
  // Dosya adı mail HTML'ine ham girmemeli (alt="..." içinde)
  const kotu = { id: 'g9', ad: '<b>x</b>"onerror=alert(1) & co.jpg', tip: 'image/jpeg', b64: 'AAAA', boyut: 10 };
  const r = mailGorselEkleri([kotu]);
  const alt = (r.html.match(/alt="([^"]*)"/) || [])[1] || '';
  ok(!alt.includes('<') && !alt.includes('>'), '4k: alt içinde ham < > yok (kaçış yapıldı)');
  ok(!/alt="[^"]*"[^>]*onerror/.test(r.html), '4l: alt\'tan öznitelik kaçışı yok');
  ok(r.ekler[0].name === kotu.ad, '4m: ek adı (JSON gövdesi) olduğu gibi korundu');
}

console.log('=== 5) data URL AYIRMA ===');
{
  const a = gorselB64Ayir('data:image/jpeg;base64,XYZ');
  ok(a && a.tip === 'image/jpeg' && a.b64 === 'XYZ', '5a: data URL doğru ayrıldı');
  ok(gorselB64Ayir('bozuk') === null, '5b: bozuk girdi null');
  ok(gorselB64Ayir(null) === null, '5c: null girdi null');
}

console.log(`\n=== TOPLAM: ${pass} geçti, ${fail} başarısız ===`);
if (fail) { console.log('\nBAŞARISIZ:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
