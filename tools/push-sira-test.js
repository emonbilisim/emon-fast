/* PUSH SIRALAYICI — eşzamanlı iki push, yavaş olan ESKİ snapshot ile yeni yazımı EZMEMELİ.
   Vaka (TLP-00546): fiyat düzenlemesinin debounce push'u sürerken "Admin Onayı İste"
   ikinci push'u başlatıyor; eski push sonra bitip full-replace ile onay isteğini siliyordu.
   Gerçek _veriPushSirali HTML'den sökülür; _veriPush, gecikmeli full-replace yapan bir
   sahte sunucuyla değiştirilir. */
const fs = require('fs');
const vm = require('vm');
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

let gecti = 0, kaldi = 0;
const iddia = (ad, k, ek) => { k ? (gecti++, console.log('  ✓ ' + ad)) : (kaldi++, console.log('  ✗ ' + ad + (ek ? '  → ' + ek : ''))); };
const bekle = ms => new Promise(r => setTimeout(r, ms));

/* Ortam: sahte sunucu (full-replace) + gecikmeli _veriPush. Push başlarken snapshot'ı
   alır, `gecikme` kadar sürer, sonra sunucuyu o snapshot ile TAMAMEN değiştirir. */
function ortam(sirali) {
  const ctx = { Promise, console, sunucu: { onay: null }, _sonKayitVeri: null, _apiKaydetTimer: null,
    _apiKaydetBekliyor: false, eszamanli: 0, maxEszamanli: 0, gecikmeler: [] };
  vm.createContext(ctx);
  ctx._veriPush = async (veri) => {
    ctx.eszamanli++; ctx.maxEszamanli = Math.max(ctx.maxEszamanli, ctx.eszamanli);
    const snap = JSON.parse(JSON.stringify(veri));
    await bekle(ctx.gecikmeler.shift() ?? 10);
    ctx.sunucu = snap;                 // full-replace
    ctx.eszamanli--;
    ctx._apiKaydetBekliyor = false;    // üretimdeki finally'nin aynısı
    return true;
  };
  if (sirali) {
    vm.runInContext(HTML.match(/let _pushAktif = null, _pushSirada = null;/)[0].replace('let', 'var'), ctx);
    vm.runInContext(kes('function _veriPushSirali()'), ctx);
  } else {
    ctx._veriPushSirali = () => ctx._veriPush(ctx._sonKayitVeri);   // ESKİ davranış
  }
  return ctx;
}

async function senaryo(sirali) {
  const c = ortam(sirali);
  c.gecikmeler = [80, 10];                         // 1. push (debounce) yavaş, 2. hızlı
  c._sonKayitVeri = { onay: null, fiyat: 2 };      // satıcı fiyatı düzenledi
  const a = c._veriPushSirali();                   // debounce push başladı
  await bekle(5);
  c._sonKayitVeri = { onay: 'bekliyor', fiyat: 2 };// "Admin Onayı İste"
  const b = c._veriPushSirali();                   // kaliciVeriKaydet → flush
  const ok = await b; await a;
  return { c, ok };
}

(async () => {
  console.log('\n=== T0: kaynak bütünlüğü ===');
  iddia('flush sıralayıcıdan geçiyor', HTML.includes('return await _veriPushSirali();'));
  iddia('debounce sıralayıcıdan geçiyor', HTML.includes('_apiKaydetTimer = null; _veriPushSirali(); }, 1000);'));
  iddia('_veriPush doğrudan başka yerden çağrılmıyor',
    (HTML.match(/[^.\w]_veriPush\(/g) || []).length === 2, (HTML.match(/[^.\w]_veriPush\(/g) || []).length);

  console.log('\n=== T1: ESKİ davranış hatayı üretiyor (test gerçekten ayırt ediyor mu?) ===');
  {
    const { c } = await senaryo(false);
    iddia('eski kodda iki push aynı anda koşuyor', c.maxEszamanli === 2);
    iddia('eski kodda onay isteği EZİLİYOR (vakanın kendisi)', c.sunucu.onay === null, JSON.stringify(c.sunucu));
  }

  console.log('\n=== T2: ★ sıralı push — onay isteği ezilmez ===');
  {
    const { c, ok } = await senaryo(true);
    iddia('★ aynı anda tek push', c.maxEszamanli === 1, c.maxEszamanli);
    iddia('★ sunucuda son durum "bekliyor"', c.sunucu.onay === 'bekliyor', JSON.stringify(c.sunucu));
    iddia('flush başarıyı GERÇEK yazımdan sonra döndürüyor', ok === true);
    iddia('kuyruk boşalınca bekliyor bayrağı iner', c._apiKaydetBekliyor === false);
  }

  console.log('\n=== T3: sıradaki push en SON snapshot\'ı gönderir, fazlası birleşir ===');
  {
    const c = ortam(true);
    c.gecikmeler = [50, 10, 10];
    c._sonKayitVeri = { v: 1 };
    const a = c._veriPushSirali();
    await bekle(5);
    c._sonKayitVeri = { v: 2 }; const b = c._veriPushSirali();
    c._sonKayitVeri = { v: 3 }; const d = c._veriPushSirali();
    iddia('sırada bekleyene katılıyor (aynı promise)', b === d);
    let ortaBayrak = null;
    a.then(() => { ortaBayrak = c._apiKaydetBekliyor; });
    await Promise.all([a, b, d]);
    iddia('★ sunucuda en son snapshot (v3)', c.sunucu.v === 3, JSON.stringify(c.sunucu));
    iddia('ilk push bitince, sıradaki varken bayrak true kalıyor', ortaBayrak === true, ortaBayrak);
    iddia('toplam 2 push (3 değil) — gereksiz tam gövde yüklemesi yok', c.gecikmeler.length === 1, 3 - c.gecikmeler.length);
  }

  console.log('\n=== T4: hata sonrası kuyruk tıkanmaz ===');
  {
    const c = ortam(true);
    let ilk = true;
    const asil = c._veriPush;
    c._veriPush = async v => { if (ilk) { ilk = false; await bekle(5); throw new Error('ağ'); } return asil(v); };
    c._sonKayitVeri = { v: 1 };
    const a = c._veriPushSirali().catch(() => 'hata');
    c._sonKayitVeri = { v: 2 };
    await bekle(1);
    const b = c._veriPushSirali();
    iddia('ilk push hata verdi', (await a) === 'hata');
    iddia('★ sonraki push yine çalıştı', (await b) === true && c.sunucu.v === 2, JSON.stringify(c.sunucu));
  }

  console.log(`\n=== TOPLAM: ${gecti} geçti, ${kaldi} başarısız ===`);
  process.exit(kaldi ? 1 : 0);
})();
