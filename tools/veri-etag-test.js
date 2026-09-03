/* GET /api/veri ETag/304 yolu — asıl iddia: 304 hiçbir zaman BAYAT veri döndürmemeli
   ve döndürülen obje çağıran tarafından mutasyona uğratılabilmeli (merge yolu bunu yapar).
   Gerçek _veriGetirEtagli HTML'den sökülür, sahte bir fetch/backend ile koşturulur. */
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const HTML = fs.readFileSync(__dirname + '/../satin_alma_acentesi.html', 'utf8');

function kes(bas) {
  const i = HTML.indexOf(bas);
  if (i < 0) throw new Error('bulunamadı: ' + bas);
  let d = 0;
  for (let k = HTML.indexOf('{', i); k < HTML.length; k++) {
    if (HTML[k] === '{') d++;
    else if (HTML[k] === '}') { d--; if (!d) return HTML.slice(i, k + 1); }
  }
  throw new Error('kapanmadı: ' + bas);
}
const KAYNAK = HTML.slice(HTML.indexOf('let _veriEtag = null, _veriEtagGovde = null;'),
                          HTML.indexOf('// Sunucudaki güncel veriyi yerel state'));

/* Sahte backend: enjekte edilen middleware'in mantığı (sha1 ETag + If-None-Match → 304). */
function backendKur(veri, opts = {}) {
  const st = { veri, istek: 0, govdeBayt: 0, kod304: 0, etagVer: opts.etagVer !== false,
               zayif: !!opts.zayif, hataKodu: opts.hataKodu || 0 };
  st.fetch = async (url, cfg) => {
    st.istek++;
    const metin = JSON.stringify(st.veri);
    const etag = '"vd1-' + crypto.createHash('sha1').update(metin).digest('hex') + '"';
    // Gerçek middleware gibi: karşılaştırmadan ÖNCE W/ önekini soy.
    const gelen = String((cfg.headers || {})['If-None-Match'] || '').replace(/^W\//, '');
    if (st.etagVer && !st.hataKodu && gelen && gelen === etag) {
      st.kod304++;
      return { ok: false, status: 304, headers: { get: () => etag }, text: async () => '' };
    }
    if (st.hataKodu) {   // status kapısı: hata gövdesi ASLA 304'e dönüşmemeli
      return { ok: false, status: st.hataKodu, headers: { get: k => k === 'ETag' ? etag : null }, text: async () => metin };
    }
    st.govdeBayt += metin.length;
    return {
      ok: true, status: 200,
      headers: { get: k => (k === 'ETag' && st.etagVer) ? (st.zayif ? 'W/' + etag : etag) : null },
      text: async () => metin,
    };
  };
  return st;
}

function ortam(st) {
  const ctx = { console, JSON, String, fetch: st.fetch, API_URL: 'http://x',
                apiTokenAl: () => 'tok', oturumSuresiDoldu: () => { ctx._401 = true; } };
  vm.createContext(ctx);
  vm.runInContext(KAYNAK, ctx);
  return ctx;
}
const cek = ctx => vm.runInContext('_veriGetirEtagli()', ctx);

let gecti = 0, kaldi = 0;
const iddia = (ad, k, ek) => { k ? (gecti++, console.log('  ✓ ' + ad)) : (kaldi++, console.log('  ✗ ' + ad + (ek ? '  → ' + ek : ''))); };

(async () => {
  console.log('\n=== T1: ilk çağrı 200, ikinci çağrı 304 — gövde inmiyor ===');
  {
    const st = backendKur({ TALEPLER: [{ no: 'A' }], v: 1 });
    const ctx = ortam(st);
    const a = await cek(ctx);
    const ilkBayt = st.govdeBayt;
    const b = await cek(ctx);
    iddia('ilk çağrı veri döndü', a && a.v === 1);
    iddia('ikinci çağrı 304 aldı', st.kod304 === 1, st.kod304);
    iddia('★ 304 AYNI veriyi döndü (bayat değil)', JSON.stringify(b) === JSON.stringify(a));
    iddia('★ ikinci çağrıda tek bayt gövde inmedi', st.govdeBayt === ilkBayt, st.govdeBayt + ' vs ' + ilkBayt);
  }

  console.log('\n=== T2: ★ sunucu DEĞİŞİNCE 304 gelmez — bayat veri imkânsız ===');
  {
    const st = backendKur({ v: 1 });
    const ctx = ortam(st);
    await cek(ctx);
    st.veri = { v: 2, yeniTalep: 'TLP-999' };        // başka kullanıcı yazdı
    const b = await cek(ctx);
    iddia('★ taze veri geldi', b.v === 2 && b.yeniTalep === 'TLP-999', JSON.stringify(b));
    iddia('304 gelmedi', st.kod304 === 0);
    const c = await cek(ctx);                         // yeni ETag'e göre tekrar
    iddia('yeni durumda tekrar 304', st.kod304 === 1);
    iddia('★ 304 GÜNCEL veriyi döndü', c.v === 2);
  }

  console.log('\n=== T3: ★ dönen obje mutasyona uğratılabilir (merge yolu bunu yapıyor) ===');
  {
    const st = backendKur({ TALEPLER: [{ no: 'A', durum: 'Yeni' }] });
    const ctx = ortam(st);
    const a = await cek(ctx);
    a.TALEPLER[0].durum = 'BOZULDU';                  // çağıran mutasyona uğratır
    a.TALEPLER.push({ no: 'X' });
    const b = await cek(ctx);                          // 304 → önbellekten
    iddia('★ önbellek mutasyondan etkilenmedi', b.TALEPLER.length === 1 && b.TALEPLER[0].durum === 'Yeni',
      JSON.stringify(b.TALEPLER));
    b.TALEPLER[0].durum = 'YİNE BOZULDU';
    const c = await cek(ctx);
    iddia('★ ikinci mutasyon da sızmadı', c.TALEPLER[0].durum === 'Yeni', c.TALEPLER[0].durum);
  }

  console.log('\n=== T4: backend YAMALANMAMIŞ (ETag yok) → önbellek kurulmaz ===');
  {
    const st = backendKur({ v: 1 }, { etagVer: false });
    const ctx = ortam(st);
    await cek(ctx);
    st.veri = { v: 2 };
    const b = await cek(ctx);
    iddia('★ ETag yokken hep taze veri', b.v === 2, JSON.stringify(b));
    iddia('hiç 304 yok', st.kod304 === 0);
    // NOT: `let` bildirimleri vm context OBJESİNE yansımaz → içeriden oku.
    iddia('önbellek boş kaldı', vm.runInContext('_veriEtag === null && _veriEtagGovde === null', ctx));
  }

  console.log('\n=== T5: nginx gzip zayıf ETag (W/"...") verirse ===');
  {
    const st = backendKur({ v: 1 }, { zayif: true });
    const ctx = ortam(st);
    const a = await cek(ctx);
    const b = await cek(ctx);
    iddia('★ veri her hâlükârda doğru', b.v === 1 && JSON.stringify(a) === JSON.stringify(b));
    // İstemci ham (W/ önekli) ETag saklar, sunucu karşılaştırmadan önce soyar → eşleşme tutar.
    iddia('★ zayıf ETag ile de 304 alınıyor (kazanç korunuyor)', st.kod304 === 1, st.kod304);
  }

  console.log('\n=== T5b: ★ status kapısı — hata gövdesi 304\'e dönüşmemeli ===');
  {
    // 401 gövdesi sabittir → ETag'i de sabit. Status kapısı olmasaydı ikinci 401
    // isteği 304 olur, istemci onu "değişmedi" sanıp önbellekteki VERİYİ döndürürdü.
    const st = backendKur({ hata: 'Token gerekli' }, { hataKodu: 401 });
    const ctx = ortam(st);
    await cek(ctx); await cek(ctx);
    iddia('★ hiçbir 401 304\'e dönüşmedi', st.kod304 === 0, st.kod304);
    iddia('önbellek kurulmadı', vm.runInContext('_veriEtagGovde === null', ctx));
  }

  console.log('\n=== T6: 401 → oturum düşürülür, veri dönmez ===');
  {
    const st = backendKur({ v: 1 });
    st.fetch = async () => ({ ok: false, status: 401, headers: { get: () => null }, text: async () => '' });
    const ctx = ortam(st);
    const a = await cek(ctx);
    iddia('null döndü', a === null);
    iddia('oturumSuresiDoldu çağrıldı', ctx._401 === true);
    iddia('401 sonrası önbellek kirlenmedi', vm.runInContext('_veriEtagGovde === null', ctx));
  }

  console.log('\n=== T7: token yoksa istek bile atılmaz ===');
  {
    const st = backendKur({ v: 1 });
    const ctx = ortam(st);
    ctx.apiTokenAl = () => null;
    const a = await cek(ctx);
    iddia('null döndü', a === null);
    iddia('hiç istek yok', st.istek === 0, st.istek);
  }

  console.log('\n=== T8: 100 tazeleme turu — trafik kazancı ===');
  {
    const buyuk = { TALEPLER: Array.from({ length: 800 }, (_, i) => ({ no: 'T' + i, d: 'x'.repeat(12000) })) };
    const st = backendKur(buyuk);
    const ctx = ortam(st);
    for (let i = 0; i < 100; i++) {
      if (i === 50) st.veri = { ...buyuk, degisti: true };   // ortada bir değişiklik
      await cek(ctx);
    }
    const inenMB = st.govdeBayt / 1048576;
    const eskiMB = (JSON.stringify(buyuk).length * 100) / 1048576;
    console.log(`     eski davranış ~${eskiMB.toFixed(0)} MB → yeni ${inenMB.toFixed(1)} MB (${st.kod304} adet 304)`);
    iddia('★ yalnız 2 kez gövde indi (ilk + değişiklik)', st.kod304 === 98, st.kod304);
    iddia('trafik %95+ azaldı', inenMB < eskiMB * 0.05, inenMB.toFixed(1));
  }

  console.log(`\n=== TOPLAM: ${gecti} geçti, ${kaldi} başarısız ===`);
  process.exit(kaldi ? 1 : 0);
})();
