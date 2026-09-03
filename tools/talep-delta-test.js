/* TALEP DELTA testi — asıl iddia: delta'yı sunucuya UYGULAMAK, full-replace ile
   BİREBİR aynı sonucu vermeli. Aksi halde talep kaybı/hayalet kayıt olur.
   satin_alma_acentesi.html'deki gerçek _talepDeltaHesapla sökülür; backend route'u
   (deploy.yml'e enjekte edilen SQL mantığı) burada JS ile taklit edilir. */
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
const ctx = { console, JSON, Array, Map, String, Object };
vm.createContext(ctx);
vm.runInContext(kes('function _talepDeltaHesapla(yeniListe, sunucuListe)'), ctx);
const delta = (a, b) => vm.runInContext('_talepDeltaHesapla(A, B)', Object.assign(ctx, { A: a, B: b }));

/* Backend /api/veri-delta route'unun satır mantığı (UPDATE-else-INSERT + DELETE),
   'no' anahtarıyla çalışan bir tablo üzerinde. Sıra: upsert'ler, sonra silmeler. */
function backendUygula(sunucuSatirlar, d, kasten) {
  const tablo = sunucuSatirlar.map(t => JSON.parse(JSON.stringify(t)));
  const cur = tablo.length;
  if (!kasten && cur >= 4 && d.sil.length > cur * 0.5) return { red: true, tablo };
  for (const t of d.upsert) {
    if (!t || t.no == null) continue;
    const i = tablo.findIndex(x => String(x.no) === String(t.no));
    if (i >= 0) tablo[i] = JSON.parse(JSON.stringify(t));
    else tablo.push(JSON.parse(JSON.stringify(t)));
  }
  for (const no of d.sil) {
    const i = tablo.findIndex(x => String(x.no) === String(no));
    if (i >= 0) tablo.splice(i, 1);
  }
  return { red: false, tablo };
}
const kume = l => JSON.stringify([...l].map(t => JSON.stringify(t)).sort());

let gecti = 0, kaldi = 0;
const iddia = (ad, k, ek) => { k ? (gecti++, console.log('  ✓ ' + ad)) : (kaldi++, console.log('  ✗ ' + ad + (ek ? '  → ' + ek : ''))); };

const T = (no, ek = {}) => Object.assign({ no, musteri: 'M' + no, durum: 'Yeni' }, ek);

console.log('\n=== T1: karışık değişiklik — delta == full-replace ===');
{
  const sunucu = [T('A'), T('B'), T('C'), T('D'), T('E')];
  const merged = [T('A'), T('B', { durum: 'Teklif Hazır' }), T('D'), T('F'), T('G')];  // C,E silindi; B değişti; F,G yeni
  const d = delta(merged, sunucu);
  iddia('delta üretildi', !!d);
  iddia('upsert = değişen + yeni (B,F,G)', kume(d.upsert) === kume([T('B', { durum: 'Teklif Hazır' }), T('F'), T('G')]),
    d.upsert.map(t => t.no).join(','));
  iddia('sil = C,E', d.sil.sort().join(',') === 'C,E', d.sil.join(','));
  iddia('DEĞİŞMEYEN A,D gönderilmiyor', !d.upsert.some(t => ['A', 'D'].includes(t.no)));
  const { tablo } = backendUygula(sunucu, d, false);
  iddia('★ sonuç full-replace ile BİREBİR aynı', kume(tablo) === kume(merged), JSON.stringify(tablo.map(t => t.no)));
}

console.log('\n=== T2: hiç değişiklik yok → boş delta ===');
{
  const sunucu = [T('A'), T('B'), T('C')];
  const d = delta(sunucu.map(t => ({ ...t })), sunucu);
  iddia('upsert boş', d.upsert.length === 0, d.upsert.length);
  iddia('sil boş', d.sil.length === 0, d.sil.length);
  iddia('★ tablo değişmedi', kume(backendUygula(sunucu, d, false).tablo) === kume(sunucu));
}

console.log('\n=== T3: no güvenilmezse delta KULLANILMAZ (tam gövdeye düşer) ===');
{
  iddia('no eksik satır → null', delta([T('A'), { musteri: 'X' }], [T('A')]) === null);
  iddia('no boş string → null', delta([T('A'), T('')], [T('A')]) === null);
  iddia('mükerrer no (yeni) → null', delta([T('A'), T('A')], [T('A')]) === null);
  iddia('mükerrer no (sunucu) → null', delta([T('A')], [T('A'), T('A')]) === null);
  iddia('dizi değilse → null', delta(null, [T('A')]) === null);
}

console.log('\n=== T4: sayısal / string no karışımı ===');
{
  const sunucu = [{ no: 12, x: 1 }, { no: '13', x: 1 }];
  const merged = [{ no: 12, x: 2 }, { no: '13', x: 1 }];
  const d = delta(merged, sunucu);
  iddia('yalnız değişen gider', d.upsert.length === 1 && d.upsert[0].no === 12, JSON.stringify(d.upsert));
  iddia('silme yok', d.sil.length === 0);
  iddia('★ sonuç eşit', kume(backendUygula(sunucu, d, false).tablo) === kume(merged));
}

console.log('\n=== T5: toplu silme koruması (veri-guard eşdeğeri) ===');
{
  const sunucu = [T('A'), T('B'), T('C'), T('D'), T('E'), T('F')];
  const merged = [T('A'), T('B')];                      // 4/6 silinecek → yarıdan fazla
  const d = delta(merged, sunucu);
  iddia('delta 4 silme içeriyor', d.sil.length === 4);
  const r = backendUygula(sunucu, d, false);
  iddia('★ kasıtsız toplu silme REDDEDİLDİ', r.red === true);
  iddia('tablo korundu', kume(r.tablo) === kume(sunucu));
  const r2 = backendUygula(sunucu, d, true);            // kullanıcı gerçekten sildiyse
  iddia('kasten=true ile silme geçer', r2.red === false && kume(r2.tablo) === kume(merged));
}

console.log('\n=== T6: gövde boyutu — asıl kazanç ===');
{
  const buyuk = i => T('TLP-' + String(i).padStart(5, '0'), { dolgu: 'x'.repeat(12000) });
  const sunucu = Array.from({ length: 800 }, (_, i) => buyuk(i));
  const merged = sunucu.map((t, i) => (i === 3 ? { ...t, durum: 'Teklif Hazır' } : t));
  const tamMB = JSON.stringify(sunucu).length / 1048576;
  const d = delta(merged, sunucu);
  const deltaMB = JSON.stringify(d).length / 1048576;
  console.log(`     tam gövde ${tamMB.toFixed(1)} MB → delta ${deltaMB.toFixed(3)} MB`);
  iddia('tam gövde 10 MB sınırını aşıyordu', tamMB > 9, tamMB.toFixed(1));
  iddia('delta sınırın çok altında', deltaMB < 0.1, deltaMB.toFixed(3));
  iddia('★ 800 talepte sonuç yine eşit', kume(backendUygula(sunucu, d, false).tablo) === kume(merged));
}

console.log('\n=== T7: yalnız SİLME / yalnız EKLEME ===');
{
  const sunucu = [T('A'), T('B'), T('C'), T('D')];
  const d1 = delta([T('A'), T('B'), T('C')], sunucu);
  iddia('tek silme: upsert boş', d1.upsert.length === 0 && d1.sil.join() === 'D');
  iddia('★ silme sonucu eşit', kume(backendUygula(sunucu, d1, false).tablo) === kume([T('A'), T('B'), T('C')]));
  const hedef = [...sunucu, T('E')];
  const d2 = delta(hedef, sunucu);
  iddia('tek ekleme: sil boş', d2.sil.length === 0 && d2.upsert.length === 1);
  iddia('★ ekleme sonucu eşit', kume(backendUygula(sunucu, d2, false).tablo) === kume(hedef));
}

console.log('\n=== T8: rastgele 300 tur — delta hiç sapmıyor ===');
{
  let sapma = 0, redSayisi = 0;
  let sunucu = Array.from({ length: 30 }, (_, i) => T('N' + i, { v: 0 }));
  for (let tur = 0; tur < 300; tur++) {
    const merged = sunucu.map(t => ({ ...t }));
    const rnd = n => Math.floor(Math.random() * n);
    for (let k = rnd(4); k > 0; k--) if (merged.length) merged[rnd(merged.length)].v = tur;         // değiştir
    for (let k = rnd(3); k > 0; k--) merged.push(T('Y' + tur + '_' + k, { v: tur }));               // ekle
    for (let k = rnd(3); k > 0; k--) if (merged.length > 5) merged.splice(rnd(merged.length), 1);   // sil
    const d = delta(merged, sunucu);
    if (!d) { sapma++; continue; }
    const r = backendUygula(sunucu, d, false);
    if (r.red) { redSayisi++; continue; }               // koruma devrede → sunucu değişmez
    if (kume(r.tablo) !== kume(merged)) sapma++;
    sunucu = r.tablo;
  }
  console.log(`     300 tur bitti, ${sunucu.length} talep hayatta, ${redSayisi} koruma reddi`);
  iddia('★ hiç sapma yok', sapma === 0, sapma);
}

console.log(`\n=== TOPLAM: ${gecti} geçti, ${kaldi} başarısız ===`);
process.exit(kaldi ? 1 : 0);
