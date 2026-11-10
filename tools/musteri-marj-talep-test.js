/* MÜŞTERİ MARJI — "admin'in marj değişikliği yansımıyor" (Intetra) + satıcı marj talebi.
   Gerçek fonksiyonlar HTML'den çıkarılıp çalıştırılır. */
const fs = require('fs');
const HTML = fs.readFileSync(__dirname + '/../satin_alma_acentesi.html', 'utf8');
const fnAl = ad => { const i = HTML.indexOf('function ' + ad + '('); if (i < 0) throw new Error(ad + ' yok');
  let d = 0, j = HTML.indexOf('{', i); for (; j < HTML.length; j++) { if (HTML[j] === '{') d++; else if (HTML[j] === '}' && --d === 0) break; }
  return HTML.slice(i, j + 1); };
eval([fnAl('_canon'), fnAl('_kayitBirlestir'), fnAl('musteriDuzenleTalebiUygula')].join('\n'));

let gecti = 0, kaldi = 0;
const iddia = (ad, k, ek) => { k ? (gecti++, console.log('  ✓ ' + ad)) : (kaldi++, console.log('  ✗ ' + ad + (ek ? '  → ' + JSON.stringify(ek) : ''))); };
const kopya = o => JSON.parse(JSON.stringify(o));

const kart = { firma: 'Intetra', sektor: 'BT', not: 'eski not', fiyatgrup: 'B', satici: 'a@emon.com.tr', tarih: '2026-01-01',
  fpKurallari: { baz: 25, urunGrubu: {} }, odeme: { havale: true } };

console.log('\n=== T1: ★ satıcı talep açtı → admin marjı değiştirdi → admin talebi onayladı ===');
{
  const eski = kopya(kart);
  const talep = { ...kopya(kart), not: 'yeni not', fpKurallari: kopya(kart.fpKurallari), _tip: 'duzenle', eskiMusteri: eski, _id: 'x' };
  const guncel = { ...kopya(kart), fpKurallari: { baz: 12, urunGrubu: {} }, satici: 'b@emon.com.tr' }; // admin bu arada
  const s = musteriDuzenleTalebiUygula(guncel, talep);
  iddia('admin\'in marjı (12) KORUNDU', s.fpKurallari.baz === 12, s.fpKurallari);
  iddia('admin\'in satıcı ataması korundu', s.satici === 'b@emon.com.tr', s.satici);
  iddia('satıcının not değişikliği uygulandı', s.not === 'yeni not');
  iddia('meta alan sızmadı', !('_tip' in s) && !('eskiMusteri' in s) && !('_id' in s));
}
console.log('\n=== T2: marj talebi onaylanınca baz marj güncelleniyor, diğer kurallar kalıyor ===');
{
  const g = { ...kopya(kart), fpKurallari: { baz: 25, iskonto: 3, urunGrubu: { SARF: 10 } } };
  const talep = { ...kopya(kart), marjTalebi: { baz: 18, gerekce: 'rakip' }, _tip: 'duzenle', eskiMusteri: kopya(kart) };
  const s = musteriDuzenleTalebiUygula(g, talep);
  iddia('baz = 18', s.fpKurallari.baz === 18, s.fpKurallari);
  iddia('iskonto + ürün grubu korunur', s.fpKurallari.iskonto === 3 && s.fpKurallari.urunGrubu.SARF === 10);
  iddia('marjTalebi karta yazılmadı', !('marjTalebi' in s));
  const g2 = { ...kopya(kart) }; delete g2.fpKurallari;
  const s2 = musteriDuzenleTalebiUygula(g2, { ...talep, eskiMusteri: kopya(g2) });
  iddia('fpKurallari hiç yokken de baz yazılır', s2.fpKurallari && s2.fpKurallari.baz === 18 && s2.fpKurallari.urunGrubu);
}
console.log('\n=== T3: satıcının değiştirdiği fiyat grubu uygulanır, değiştirmediği admin değeri ezilmez ===');
{
  const s = musteriDuzenleTalebiUygula({ ...kopya(kart), fiyatgrup: 'A' }, { ...kopya(kart), _tip: 'duzenle', eskiMusteri: kopya(kart) });
  iddia('admin A yaptı, satıcı dokunmadı → A', s.fiyatgrup === 'A', s.fiyatgrup);
  const s2 = musteriDuzenleTalebiUygula(kopya(kart), { ...kopya(kart), fiyatgrup: 'C', _tip: 'duzenle', eskiMusteri: kopya(kart) });
  iddia('satıcı C istedi → C', s2.fiyatgrup === 'C');
}
console.log('\n=== T4: talep yolu satıcıya bağlı + ortak uygulayıcı kullanılıyor ===');
{
  iddia('onay kabulü ortak fonksiyonu kullanıyor', HTML.includes('const musteriVeri = musteriDuzenleTalebiUygula(MUSTERILER[hedef], kayit);'));
  iddia('eski ezici kopya yolu kalktı', !HTML.includes("if (MUSTERILER[hedef].fpKurallari && !musteriVeri.fpKurallari)"));
  iddia('form alanı var', HTML.includes('id="mf-marj-talep-baz"') && HTML.includes('id="mf-marj-talep-gerekce"'));
  iddia('admin e-postası tetikleniyor', HTML.includes('if (marjTalebi) marjTalebiBildirimGonder(firma, marjTalebi);'));
  iddia('diff\'te marj talebi gösteriliyor', HTML.includes('📈 Kar marjı talebi:'));
}
console.log('\n' + (kaldi ? '❌ ' : '✅ ') + gecti + ' geçti, ' + kaldi + ' kaldı');
process.exit(kaldi ? 1 : 0);
