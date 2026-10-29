/* REVİZYONLAR — admin'e ayrı alan + rozet + e-posta (TLP-00546: admin hiçbir uyarı görmedi).
   Gerçek fonksiyonlar HTML'den sökülür, DOM ve mail sahte nesnelerle değiştirilir. */
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

const elemanlar = {};
const el = id => elemanlar[id] || (elemanlar[id] = { id, innerHTML: '', textContent: '', style: {} });
const mailler = [];
const ctx = {
  console, JSON, Math, Date, String, Array, Object, Promise,
  TALEPLER: [], AYARLAR: { awayMode: true }, aktifKullanici: { rol: 'admin', ad: 'Selim' },
  document: { getElementById: el },
  _htmlKacir: x => String(x == null ? '' : x).replace(/</g, '&lt;'),
  tarihFmt: x => String(x).slice(0, 10),
  talepSorumluKullanici: t => ({ ad: t.saticiAd || 'Zennube' }),
  fiyatOnayKapaliRozet: () => '', fiyatOnayKapaliAsim: () => false, marjAltiOzet: () => null,
  onaylayanMailiCoz: () => 'selim@emon.com.tr',
  talepLinkButonuHtml: (t) => '<a href="#talep=' + t.no + '">link</a>',
  graphMailHtmlGonder: async (to, konu, html) => { mailler.push({ to, konu, html }); return true; },
  showToast: () => {},
  sunucudanTazele: async () => false,
};
vm.createContext(ctx);
vm.runInContext(HTML.match(/const TALEP_KAPALI_DURUMLAR = \[[^\]]*\];/)[0].replace('const ', 'var '), ctx);
vm.runInContext(HTML.match(/function talepKapaliMi\(t\) \{[^\n]*\}/)[0], ctx);
vm.runInContext(HTML.match(/const REVIZYON_TAKIP_GUN = \d+;/)[0].replace('const ', 'var '), ctx);
for (const f of ['function fiyatOnayGorunur(t)', 'function fiyatRevizyonHazirlaniyor(t)', 'function _revizyonAni(t)',
  'function revizyonListeleri()', 'function fiyatOnayBekleyenKart(t)', 'function revizyonHazirlanKart(t)',
  'function renderRevizyonlar()', 'function renderPanelRevizyonlar()', 'function onayBekleyenBadgeGuncelle()',
  'async function revizyonIstendiBildirimGonder(t, opts)']) vm.runInContext(kes(f), ctx);

const simdi = Date.now();
const iso = ms => new Date(ms).toISOString();
ctx.TALEPLER = [
  // TLP-00546'nın canlı hâli: revize istendi, onay düştü, yeniden gönderilmedi
  { no: 'TLP-00546', musteri: 'KANADEVIA', durum: 'Müşteriye İletildi', fiyatOnayDurumu: null, teklifDurumu: 'revize',
    teklifRevizeTarih: iso(simdi - 86400000), fiyatOnaySira: simdi - 3600000, musteriTeklifGonderildi: true,
    fiyatOnayTalep: { satici: 'Zennube', tarih: iso(simdi - 86400000), otomatikOnay: true } },
  // satıcı revize fiyatı gönderdi → onay bekleyen revizyon
  { no: 'TLP-00600', musteri: 'A', durum: 'Fiyatlandı', fiyatOnayDurumu: 'bekliyor', urun: 'x',
    fiyatOnayTalep: { satici: 'Zennube', tarih: iso(simdi), revizyon: 'Müşteri revizyon istedi', toplamStr: '1.000 TL' } },
  // ilk tur onay → Revizyonlar'da DEĞİL
  { no: 'TLP-00601', musteri: 'B', durum: 'Fiyatlandı', fiyatOnayDurumu: 'bekliyor', urun: 'y',
    fiyatOnayTalep: { satici: 'Ali', tarih: iso(simdi) } },
  // 90 gün önce revize istenmiş, terk edilmiş → takip penceresi dışında
  { no: 'TLP-00100', musteri: 'C', durum: 'Müşteriye İletildi', fiyatOnayDurumu: null, teklifDurumu: 'revize',
    teklifRevizeTarih: iso(simdi - 90 * 86400000), fiyatOnaySira: simdi - 90 * 86400000 },
  // kapalı talep → listelenmez
  { no: 'TLP-00200', musteri: 'D', durum: 'Tamamlandı', fiyatOnayDurumu: null, teklifDurumu: 'revize', teklifRevizeTarih: iso(simdi) },
];

(async () => {
  console.log('\n=== T0: kaynak bütünlüğü — menü, sayfa, yetki, tetikleyiciler ===');
  iddia('menü öğesi + rozet var', HTML.includes('id="nav-revizyonlar"') && HTML.includes('id="revizyon-badge"'));
  iddia('sayfa var', HTML.includes('id="page-revizyonlar"') && HTML.includes('id="revizyonlar-icerik"'));
  iddia('admin-only', /ADMIN_ONLY_SAYFALAR = \[[^\]]*'revizyonlar'/.test(HTML));
  iddia('goPage sayfayı tazeliyor', HTML.includes("if (id === 'revizyonlar') revizyonlarTazele();"));
  iddia('menü yalnız admin\'e açılıyor', HTML.includes("if (navRev) navRev.style.display = isAdmin ? '' : 'none';"));
  iddia('canlı tazelemede yeniden çiziliyor', HTML.includes("page-revizyonlar')?.classList.contains('active')) renderRevizyonlar();"));
  iddia('"Revize İstendi" butonu mail atıyor', /fiyatOnayiniGecersizKil\(t\);[^\n]*\n  veriKaydet\(\);\n  revizyonIstendiBildirimGonder\(t, \{ kaynak: 'elle'/.test(HTML));
  iddia('mailden revizyon uygulanınca mail atıyor', HTML.includes("revizyonIstendiBildirimGonder(t, { kaynak: 'mail'"));
  iddia('panel kartı var', HTML.includes('id="panel-revizyon-card"'));

  console.log('\n=== T1: ★ doğru talepler doğru grupta ===');
  const L = vm.runInContext('revizyonListeleri()', ctx);
  iddia('★ TLP-00546 "fiyat hazırlanıyor" grubunda', L.hazirlanan.map(t => t.no).join() === 'TLP-00546', L.hazirlanan.map(t => t.no).join());
  iddia('★ gönderilmiş revizyon "onay bekleyen" grubunda', L.bekleyen.map(t => t.no).join() === 'TLP-00600');
  iddia('ilk tur onay Revizyonlar\'a girmiyor', !L.bekleyen.some(t => t.no === 'TLP-00601'));
  iddia('30 günden eski terk edilmiş revizyon rozeti şişirmiyor', !L.hazirlanan.some(t => t.no === 'TLP-00100'));
  iddia('kapalı talep listelenmiyor', !L.hazirlanan.some(t => t.no === 'TLP-00200'));
  iddia('toplam = 2', L.toplam === 2, L.toplam);

  console.log('\n=== T2: ★ ekran + rozet + panel hatasız çiziliyor ===');
  vm.runInContext('renderRevizyonlar()', ctx);
  const h = el('revizyonlar-icerik').innerHTML;
  iddia('★ sayfada TLP-00546 var', h.includes('TLP-00546'));
  iddia('onay bekleyen kartta Onayla/Reddet var', h.includes('TLP-00600') && h.includes('adminFiyatOnayla') && h.includes('adminFiyatReddet'));
  iddia('ilk tur onay sayfada yok', !h.includes('TLP-00601'));
  vm.runInContext('onayBekleyenBadgeGuncelle()', ctx);
  iddia('★ Revizyonlar rozeti 2', el('revizyon-badge').textContent === 2 && el('revizyon-badge').style.display === 'inline', el('revizyon-badge').textContent);
  iddia('Fiyat Onayları rozeti revizyonu saymıyor (1)', el('onay-bekleyen-badge').textContent === 1, el('onay-bekleyen-badge').textContent);
  iddia('★ panel kartı görünür ve TLP-00546 içeriyor',
    el('panel-revizyon-card').style.display === 'block' && el('panel-revizyon-icerik').innerHTML.includes('TLP-00546'));

  console.log('\n=== T3: ★ revize istendiğinde admin\'e e-posta ===');
  ctx.aktifKullanici = { rol: 'satici', ad: 'Zennube' };
  await vm.runInContext("revizyonIstendiBildirimGonder(TALEPLER[0], { kaynak: 'elle', not: 'iskonto istiyor' })", ctx);
  iddia('★ mail gitti', mailler.length === 1);
  const m = mailler[0] || {};
  iddia('admin adresine', (m.to || []).join() === 'selim@emon.com.tr');
  iddia('konu ayrı: [Revizyon Talebi]', /^\[Revizyon Talebi\] TLP-00546/.test(m.konu || ''), m.konu);
  iddia('revize notu ve derin link içeriyor', (m.html || '').includes('iskonto istiyor') && (m.html || '').includes('#talep=TLP-00546'));
  ctx.aktifKullanici = { rol: 'admin', ad: 'Selim' };
  await vm.runInContext("revizyonIstendiBildirimGonder(TALEPLER[0], {})", ctx);
  iddia('admin kendisi işaretlediyse kendine mail atmıyor', mailler.length === 1);

  console.log(`\n=== TOPLAM: ${gecti} geçti, ${kaldi} başarısız ===`);
  process.exit(kaldi ? 1 : 0);
})();
