/* MARJ KAPISI — away modunda bile hedef marjın altındaki fiyat otomatik ONAYLANMAMALI.
   Asıl iddia: satış tablosunda kırmızı "⚠ altında" uyarısı üreten koşul ile oto-onay
   kapısının kararı ASLA ayrışmamalı (satıcı ekranda ne görüyorsa kapı da onu görsün).
   Gerçek kaynaklar HTML'den sökülür: kapı ifadesi, biriktirme koşulu ve marjAltiOzet. */
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

const ctx = { console, JSON, Array, Math, String, Object, AYARLAR: { awayMode: false } };
vm.createContext(ctx);
vm.runInContext(kes('function marjAltiOzet(oT)'), ctx);
vm.runInContext(kes('function fiyatOnayRevizyonSebebi(t)'), ctx);
const rev = t => vm.runInContext('fiyatOnayRevizyonSebebi(T)', Object.assign(ctx, { T: t }));
vm.runInContext(HTML.match(/const TALEP_KAPALI_DURUMLAR = \[[^\]]*\];/)[0].replace('const ', 'var '), ctx);
vm.runInContext(HTML.match(/function talepKapaliMi\(t\) \{[^\n]*\}/)[0], ctx);
vm.runInContext(kes('function fiyatRevizyonHazirlaniyor(t)'), ctx);
const hz = t => vm.runInContext('fiyatRevizyonHazirlaniyor(T)', Object.assign(ctx, { T: t }));
const ozet = oT => vm.runInContext('marjAltiOzet(O)', Object.assign(ctx, { O: oT }));

/* Üretimdeki kapı ifadesinin BİREBİR kendisi (HTML'den doğrulanıyor, aşağıda T0). */
const KAPI_KAYNAK = 'const _marjKapisi = !Array.isArray(_marjAlti) || _marjAlti.length > 0;';
function kapi(marjAlti) {
  return vm.runInContext('(() => { const _marjAlti = M; ' + KAPI_KAYNAK + ' return _marjKapisi; })()',
    Object.assign(ctx, { M: marjAlti }));
}
/* Satış tablosundaki kırmızı uyarı koşulu (aynı eşik). */
const uyariGorunur = (marj, hedef) => (marj - hedef) < -0.05;

let gecti = 0, kaldi = 0;
const iddia = (ad, k, ek) => { k ? (gecti++, console.log('  ✓ ' + ad)) : (kaldi++, console.log('  ✗ ' + ad + (ek ? '  → ' + ek : ''))); };

console.log('\n=== T0: kaynak bütünlüğü — test üretimdeki ifadelerin AYNISINI kullanıyor ===');
{
  iddia('kapı ifadesi HTML\'de birebir var', HTML.includes(KAPI_KAYNAK));
  iddia('oto-onay koşulu marj kapısına bağlı', HTML.includes('if (AYARLAR.awayMode && !_marjKapisi && !_revizyon) {'));
  iddia('biriktirme, kırmızı uyarı koşulunun İÇİNDE',
    /if \(fark < -0\.05\) \{[\s\S]{0,200}window\._satisMarjAlti\.push\(/.test(HTML));
  iddia('liste her render başında sıfırlanıyor', HTML.includes('window._satisMarjAlti = [];'));
}

console.log('\n=== T1: ★ marj altındayken away modda OTOMATİK ONAY YOK ===');
{
  const alti = [{ satir: 1, urun: 'HP Notebook', marj: 8, hedef: 15, fark: -7 }];
  iddia('★ kapı kapalı (manuel onaya düşer)', kapi(alti) === true);
  iddia('birden çok kalemde de kapalı', kapi([...alti, { satir: 3, marj: 2, hedef: 20, fark: -18 }]) === true);
}

console.log('\n=== T2: marj tutuyorsa away modu ESKİSİ GİBİ çalışır (regresyon yok) ===');
{
  iddia('★ boş liste → oto-onay serbest', kapi([]) === false);
}

console.log('\n=== T3: ★ fail-safe — marj hesaplanamadıysa oto-onay YOK ===');
{
  iddia('undefined → kapı kapalı', kapi(undefined) === true);
  iddia('null → kapı kapalı', kapi(null) === true);
  iddia('dizi olmayan değer → kapı kapalı', kapi({}) === true && kapi('x') === true);
}

console.log('\n=== T4: ★ ekrandaki uyarı ile kapı ASLA ayrışmaz ===');
{
  // Satış tablosu bir satırı kırmızı gösteriyorsa liste dolar → kapı kapanır; göstermiyorsa boş kalır.
  const senaryolar = [
    { ad: 'tam hedefte',        marj: 15,    hedef: 15 },
    { ad: 'hedefin üstünde',    marj: 22,    hedef: 15 },
    { ad: 'tolerans içinde',    marj: 14.97, hedef: 15 },   // fark -0.03 → uyarı YOK
    { ad: 'tolerans sınırında', marj: 14.94, hedef: 15 },   // fark -0.06 → uyarı VAR
    { ad: 'çok altında',        marj: 3,     hedef: 25 },
    { ad: 'zararına',           marj: -12,   hedef: 10 },
    { ad: 'hedef sıfır, marj eksi', marj: -1, hedef: 0 },
  ];
  let ayrisma = 0;
  for (const sen of senaryolar) {
    const kirmizi = uyariGorunur(sen.marj, sen.hedef);
    const liste = kirmizi ? [{ satir: 1, urun: 'X', marj: sen.marj, hedef: sen.hedef, fark: sen.marj - sen.hedef }] : [];
    const kapali = kapi(liste);
    if (kirmizi !== kapali) { ayrisma++; console.log('     ✗ AYRIŞMA: ' + sen.ad); }
    else console.log(`     · ${sen.ad}: uyarı=${kirmizi ? 'VAR' : 'yok'}, oto-onay=${kapali ? 'ENGELLİ' : 'serbest'}`);
  }
  iddia('★ hiçbir senaryoda ayrışma yok', ayrisma === 0, ayrisma);
}

console.log('\n=== T5: hedef marjı TANIMSIZ müşteride away modu bozulmaz ===');
{
  // musteriHedefMarj === null olan satırlar listeye hiç eklenmez (üretimde `if (musteriHedefMarj !== null)`).
  iddia('hedef yok → liste boş → oto-onay serbest', kapi([]) === false);
  iddia('koşul üretimde gerçekten var', HTML.includes('if (musteriHedefMarj !== null) {'));
}

console.log('\n=== T6: marjAltiOzet — admin ne görüyor ===');
{
  iddia('uyarı yoksa null', ozet({}) === null && ozet(null) === null);
  iddia('boş dizide null', ozet({ marjAltiUyari: [] }) === null);
  const o = ozet({ marjAltiUyari: [{ satir: 2, urun: 'Lenovo E14', marj: 8.3, hedef: 15 }] });
  iddia('kalem sayısı yazıyor', /^1 kalem/.test(o), o);
  iddia('satır no, ürün, marj ve hedef görünüyor',
    o.includes('#2') && o.includes('Lenovo E14') && o.includes('%8,3') && o.includes('hedef %15'), o);
  iddia('ondalık TR biçiminde (virgül)', o.includes('8,3') && !o.includes('8.3'), o);
  const h = ozet({ marjAltiUyari: 'hesaplanamadi' });
  iddia('hesaplanamadı hâli anlaşılır', /Marj kontrolü yapılamadı/.test(h), h);
  const c = ozet({ marjAltiUyari: [{ satir: 1, urun: 'A', marj: 1, hedef: 9 }, { satir: 4, urun: 'B', marj: 2, hedef: 8 }] });
  iddia('çok kalemde hepsi listeleniyor', /^2 kalem/.test(c) && c.includes('#1') && c.includes('#4'), c);
}

console.log('\n=== T7: uyarı bayrağı taşınmıyor (marj düzeltilince temizlenir) ===');
{
  iddia('temizleme dalı üretimde var', HTML.includes("delete t.fiyatOnayTalep.marjAltiUyari;"));
  // Davranış: kapı açıkken (marj tuttu) eski uyarı silinir → admin bayat kırmızı görmez
  const oT = { marjAltiUyari: [{ satir: 1, urun: 'X', marj: 1, hedef: 9 }] };
  const kapali = kapi([]);
  if (!kapali && oT.marjAltiUyari) delete oT.marjAltiUyari;
  iddia('★ marj düzelince uyarı düşüyor', ozet(oT) === null);
}

console.log('\n=== T8: ★ REVİZYON — away modunda otomatik onaylanmaz ===');
{
  iddia('sebep, önceki tur EZİLMEDEN önce hesaplanıyor',
    /const _revizyon = fiyatOnayRevizyonSebebi\(t\);[\s\S]{0,80}t\.fiyatOnayTalep  = \{/.test(HTML));
  iddia('işaret yeni onay talebine yazılıyor', HTML.includes('if (_revizyon) t.fiyatOnayTalep.revizyon = _revizyon;'));
  iddia('ilk tur (taze talep) revizyon DEĞİL → away eskisi gibi', rev({ durum: 'Yeni' }) === null);
  iddia('★ müşteri revize istedi', !!rev({ teklifDurumu: 'revize' }));
  iddia('★ müşteri revizyonu uygulandı (teklif gitmemiş)', !!rev({ teklifRevizeTarih: '2026-10-01' }));
  iddia('★ teklif müşteriye gitmiş', !!rev({ musteriTeklifGonderildi: true }));
  iddia('★ onay geri açılıp yeniden gönderildi', !!rev({ fiyatOnayDurumu: null, fiyatOnayTalep: { tarih: 'x' } }));
  iddia('★ onaylıyken yeniden gönderildi', !!rev({ fiyatOnayDurumu: 'onaylandi', fiyatOnayTalep: { tarih: 'x' } }));
  iddia('★ reddedilen yeniden gönderildi', /Reddedilen/.test(rev({ fiyatOnayDurumu: 'reddedildi', fiyatOnayTalep: {} }) || ''));
  iddia('bekleyen talep yeniden gönderilince yeni tur sayılmaz',
    rev({ fiyatOnayDurumu: 'bekliyor', fiyatOnayTalep: { tarih: 'x' } }) === null);
  iddia('bekleyen revizyon yeniden gönderilince etiket korunur',
    rev({ fiyatOnayDurumu: 'bekliyor', fiyatOnayTalep: { revizyon: 'R' } }) === 'R');
}

console.log('\n=== T9: ★ revize var ama satıcı henüz göndermedi → admin listesinde GÖRÜNÜR ===');
{
  // TLP-00546'nın canlı verideki hâli (2026-10-29): oto-onay geçersiz kılınmış, yeniden gönderilmemiş
  const t546 = { no: 'TLP-00546', durum: 'Müşteriye İletildi', fiyatOnayDurumu: null, teklifDurumu: 'revize',
    teklifRevizeTarih: '2026-10-28T08:23:00.165Z', musteriTeklifGonderildi: true,
    fiyatOnayTalep: { satici: 'Zennube', tarih: '2026-10-28T08:24:29.362Z', otomatikOnay: true } };
  iddia('★ TLP-00546 listede görünür', hz(t546) === true);
  iddia('revize istendi, hiç onay turu yok → görünür', hz({ durum: 'Müşteriye İletildi', teklifDurumu: 'revize' }) === true);
  iddia('onay geri açıldı (tur var, durum boş) → görünür', hz({ durum: 'Fiyatlandı', fiyatOnayTalep: { tarih: 'x' } }) === true);
  iddia('onaya gönderilince bu listeden çıkar (bekliyor)', hz(Object.assign({}, t546, { fiyatOnayDurumu: 'bekliyor' })) === false);
  iddia('onaylanınca çıkar', hz(Object.assign({}, t546, { fiyatOnayDurumu: 'onaylandi' })) === false);
  iddia('kapalı talep listelenmez', hz(Object.assign({}, t546, { durum: 'Tamamlandı' })) === false);
  iddia('müşteri reddettiyse listelenmez', hz(Object.assign({}, t546, { teklifDurumu: 'red' })) === false);
  iddia('taze talep (tur yok, revize yok) listelenmez', hz({ durum: 'Yeni' }) === false);
  iddia('kaydı silinmiş geçmiş listelenmez', hz({ durum: 'Müşteriye İletildi', musteriTeklifGonderildi: true }) === false);
}

console.log(`\n=== TOPLAM: ${gecti} geçti, ${kaldi} başarısız ===`);
process.exit(kaldi ? 1 : 0);
