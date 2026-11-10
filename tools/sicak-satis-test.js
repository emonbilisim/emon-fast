/* SICAK SATIŞ — aday modülü: sistem ipuçları, AI yanıt çözümü, görünürlük, kaynak bağlantıları.
   Gerçek fonksiyonlar HTML'den çıkarılıp sahte global durumla çalıştırılır. */
const fs = require('fs');
const HTML = fs.readFileSync(__dirname + '/../satin_alma_acentesi.html', 'utf8');
// Üst düzey fonksiyonu çıkar: tek satırlıksa o satır, değilse ilk "\n}\n"e kadar
// (gövdedeki '{' string'leri saf ayraç sayımını şaşırttığı için satır-sonu kapanışı esas alınır).
const fnAl = ad => {
  const i = HTML.search(new RegExp('\\n(async )?function ' + ad + '\\(')) + 1;
  if (i <= 0) throw new Error(ad + ' yok');
  const satirSonu = HTML.indexOf('\n', i), ilk = HTML.slice(i, satirSonu);
  if (/\}\s*$/.test(ilk) && (ilk.match(/\{/g) || []).length === (ilk.match(/\}/g) || []).length) return ilk;
  return HTML.slice(i, HTML.indexOf('\n}\n', i) + 2);
};
let gecti = 0, kaldi = 0;
const iddia = (ad, k, ek) => { k ? (gecti++, console.log('  ✓ ' + ad)) : (kaldi++, console.log('  ✗ ' + ad + (ek !== undefined ? '  → ' + JSON.stringify(ek) : ''))); };

// Sahte ortam
let aktifKullanici = { rol: 'admin', email: 'admin@emon.com.tr', ad: 'Admin' };
let ADAYLAR = [], MUSTERILER = [], TALEPLER = [], OTO_DURUM = { taslaklar: [] }, AYARLAR = {};
const _benEmail = () => (aktifKullanici.email || '').toLowerCase();
const talepBenim = t => aktifKullanici.rol === 'admin' || (t.saticiEmail || '') === aktifKullanici.email;
const crmStatTalepler = l => l; const crmStatMusteriler = () => MUSTERILER.filter(m => m.musteriTipi !== 'demo');
eval(['_musteriNorm','crmSiparisMi','crmDonulduMu','sicakSatisGorunur','_adayAdmin','adayGorunurMu','adayFirmaBul','musteriFirmaVarMi','adaySistemOnerileriHesapla','_jsonNesneleri','_aiMetin','adayAiYanitCoz','_adayIletisimBirlestir'].map(fnAl).join('\n'));
const gunOnce = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

console.log('\n=== T1: sistem ipuçları ===');
MUSTERILER = [
  { firma: 'Eski Sadık A.Ş.', satici: 'ali@emon.com.tr', yetkililer: [{ ad: 'Ayşe', mail: 'a@eski.com' }] },
  { firma: 'Hep Teklif Ltd', satici: 'veli@emon.com.tr' },
  { firma: 'Aktif Müşteri', satici: 'ali@emon.com.tr' },
  { firma: 'Demo Firma', musteriTipi: 'demo' },
];
TALEPLER = [
  { no: 1, musteri: 'Kartsız Bilişim', tarih: gunOnce(5) },
  { no: 2, musteri: 'KARTSIZ BİLİŞİM', tarih: gunOnce(2), durum: 'Sipariş Verildi' },
  { no: 3, musteri: 'Eski Sadık A.Ş.', tarih: gunOnce(200), durum: 'Tamamlandı' },
  { no: 4, musteri: 'Hep Teklif Ltd', tarih: gunOnce(30), musteriTeklifGonderildi: true },
  { no: 5, musteri: 'Hep Teklif Ltd', tarih: gunOnce(90), durum: 'Müşteriye İletildi' },
  { no: 6, musteri: 'Aktif Müşteri', tarih: gunOnce(10), durum: 'Tamamlandı' },
  { no: 7, musteri: 'Demo Firma', tarih: gunOnce(300), durum: 'Tamamlandı' },
];
OTO_DURUM.taslaklar = [
  { musteri: '', gonderen: 'satin@yenifirma.com.tr', gonderenAd: 'Mehmet', konu: 'Toner fiyatı', icIletme: false },
  { musteri: 'Aktif Müşteri', gonderen: 'x@aktif.com' },
  { musteri: '', gonderen: 'ben@emon.com.tr', icIletme: true },           // iç iletme, öneri yok → atla
];
let o = adaySistemOnerileriHesapla();
const bul = f => o.find(x => x.firma === f);
iddia('kartsız talep bulundu (Türkçe/büyük-küçük harf birleşik)', o.filter(x => x.kaynak === 'kartsiz').length === 1 && /sipariş de vermiş/.test(o.find(x => x.kaynak === 'kartsiz').neden), o.filter(x=>x.kaynak==='kartsiz'));
iddia('gelen mail → domain ile aday', !!bul('yenifirma.com.tr') && bul('yenifirma.com.tr').kisi === 'Mehmet');
iddia('iç iletme / kayıtlı müşteri maili önerilmez', o.filter(x => x.kaynak === 'mail').length === 1);
iddia('sessiz müşteri (sipariş verdi, 200 gün sessiz)', bul('Eski Sadık A.Ş.')?.kaynak === 'sessiz' && bul('Eski Sadık A.Ş.').kisi === 'Ayşe' && bul('Eski Sadık A.Ş.').sahip === 'ali@emon.com.tr');
iddia('teklif alıp almayan (2 teklif, 0 sipariş)', bul('Hep Teklif Ltd')?.kaynak === 'donusmeyen');
iddia('aktif müşteri önerilmez', !bul('Aktif Müşteri'));
iddia('demo müşteri önerilmez', !bul('Demo Firma'));
iddia('kartsız talep ilk sırada', o[0].kaynak === 'kartsiz');
ADAYLAR = [{ id: 'a1', firma: 'eski sadik a.s.' }];
o = adaySistemOnerileriHesapla();
iddia('zaten aday olan firma tekrar önerilmez', !o.find(x => x.firma === 'Eski Sadık A.Ş.'));

console.log('\n=== T2: satıcı yalnız kendi müşterilerini/taleplerini görür ===');
aktifKullanici = { rol: 'satici', email: 'veli@emon.com.tr' };
AYARLAR.sicakSatisAktif = true;
ADAYLAR = [];
TALEPLER.forEach(t => t.saticiEmail = (t.musteri === 'Hep Teklif Ltd' ? 'veli@emon.com.tr' : 'ali@emon.com.tr'));
o = adaySistemOnerileriHesapla();
iddia('veli yalnız kendi müşterisini görüyor', o.length === 1 && o[0].firma === 'Hep Teklif Ltd', o.map(x => x.firma));
iddia('satıcıya gelen mail taslakları gösterilmez (ortak kutu)', !o.some(x => x.kaynak === 'mail'));
iddia('satıcı görünürlüğü: kendi adayı evet, başkasınınki hayır', adayGorunurMu({ sahip: 'VELI@emon.com.tr' }) && !adayGorunurMu({ sahip: 'ali@emon.com.tr' }) && !adayGorunurMu({ sahip: '' }));
aktifKullanici = { rol: 'admin', email: 'admin@emon.com.tr' };
iddia('admin hepsini görür', adayGorunurMu({ sahip: 'ali@emon.com.tr' }) && adayGorunurMu({ sahip: '' }));
aktifKullanici = { rol: 'operasyon', email: 'op@emon.com.tr' };
AYARLAR.sicakSatisAktif = true;
iddia('operasyon rolüne modül kapalı (açıkken bile)', !sicakSatisGorunur());

console.log('\n=== T2b: CRM gibi aç/kapa ===');
aktifKullanici = { rol: 'satici', email: 'veli@emon.com.tr' };
AYARLAR = {};
iddia('varsayılan: satıcıya KAPALI', !sicakSatisGorunur());
AYARLAR.sicakSatisAktif = true;
iddia('açılınca satıcı görür', sicakSatisGorunur());
AYARLAR.sicakSatisAktif = false; aktifKullanici = { rol: 'admin', email: 'admin@emon.com.tr' };
iddia('kapalıyken admin yine görür', sicakSatisGorunur());
iddia('varsayılan ayar false', /sicakSatisAktif: false,/.test(HTML));
iddia('ayar kartı + toggle', HTML.includes('id="ayar-sicak-satis-aktif"') && HTML.includes('onchange="sicakSatisAktifToggle(this)"'));
iddia('kapalıyken atama maili gitmez', HTML.includes('if (!AYARLAR.sicakSatisAktif) return; // modül satıcılara kapalı'));
iddia('nav güncelleme rol + panel tazelemede', (HTML.match(/mailorderNavGuncelle\(\);\n  sicakSatisNavGuncelle\(\);/g) || []).length === 2);

console.log('\n=== T3: AI yanıt çözümü (web aramalı çok bloklu yanıt) ===');
const content = [
  { type: 'text', text: 'Arıyorum.' },
  { type: 'server_tool_use', id: 'x', name: 'web_search', input: { query: 'lojistik' } },
  { type: 'web_search_tool_result', tool_use_id: 'x', content: [{ type: 'web_search_result', url: 'https://a.com' }] },
  { type: 'text', text: 'Sonuçlar:\n```json\n{"adaylar":[{"firma":"Hızlı Lojistik","sehir":"İstanbul",' },
  { type: 'text', text: '"kaynak":"https://a.com"},{"firma":""}]}\n```' },
];
const l = adayAiYanitCoz(content);
iddia('bölünmüş text blokları birleşip JSON çözüldü', l.length === 1 && l[0].firma === 'Hızlı Lojistik', l);
iddia('bozuk yanıt → null (okunamadı, "bulunamadı"dan ayrı)', adayAiYanitCoz([{ type: 'text', text: 'üzgünüm {adaylar: yok' }]) === null);
iddia('gerçekten boş liste → [] ', JSON.stringify(adayAiYanitCoz([{ type: 'text', text: '{"adaylar":[]}' }])) === '[]');
// ★ eski regex hatası: JSON'dan önce düz metinde "{" geçince hiç okunamıyordu
const onMetin = [{ type: 'text', text: 'Sorgu kalıbı {sektör} + {şehir} kullandım. Ayrıca {"not":"x"} ara nesne.\n{"adaylar":[{"firma":"A Lojistik","neden":"yeni depo {2026}"},{"firma":"B Nakliyat"}]}' }];
const ol = adayAiYanitCoz(onMetin);
iddia('★ önde "{" / ara nesne / string içinde ayraç olsa da okunuyor', ol && ol.length === 2 && ol[0].neden === 'yeni depo {2026}', ol);
iddia('kesik (max_tokens) yanıt → null', adayAiYanitCoz([{ type: 'text', text: '{"adaylar":[{"firma":"A"},{"firma":"B' }]) === null);
iddia('birden çok "adaylar" nesnesi → SONUNCUSU (düzeltilmiş liste)', adayAiYanitCoz([{ type: 'text', text: '{"adaylar":[{"firma":"Taslak"}]} düzelttim: {"adaylar":[{"firma":"Son"}]}' }])[0].firma === 'Son');

console.log('\n=== T3b: iletişim zenginleştirme birleştirme ===');
const h = { firma: 'X', tel: '0212 000', web: '' };
const dolu = _adayIletisimBirlestir(h, { web: 'x.com.tr', tel: '0216 999', mail: 'info@x.com.tr', kisi: 'Ali Veli', unvan: 'Satın Alma Md.', adres: 'Tuzla/İstanbul', kaynak: 'https://x.com.tr/iletisim' });
iddia('boş alanlar dolduruldu', h.web === 'x.com.tr' && h.mail === 'info@x.com.tr' && h.kisi === 'Ali Veli' && h.sehir === 'Tuzla/İstanbul', h);
iddia('dolu alan (tel) EZİLMEDİ', h.tel === '0212 000');
iddia('doldurulan alan listesi doğru', JSON.stringify(dolu.sort()) === JSON.stringify(['kisi','mail','sehir','unvan','web']), dolu);
const h2 = {}; _adayIletisimBirlestir(h2, { mail: 'ali.veli at x' });
iddia('geçersiz e-posta yazılmıyor', !h2.mail);

console.log('\n=== T3c: AI istek ayarları ===');
iddia('keşif: effort medium (low az arama yapıyordu)', /output_config: \{ effort: 'medium' \}[\s\S]{0,400}web_search_20260209/.test(HTML));
iddia('keşif + zenginleştirme web_fetch kullanıyor', (HTML.match(/type: 'web_fetch_20260209'/g) || []).length === 2);
iddia('zenginleştirme paralel 3 işçi', HTML.includes('Promise.all([isci(), isci(), isci()])'));
iddia('iletişim bitene kadar ekle butonu kilitli', HTML.includes("ekleBtn.disabled = true;"));
iddia('aday kartında İletişim bul butonu', HTML.includes('id="aday-iletisim-btn"') && HTML.includes('async function adayKartIletisimBul()'));

console.log('\n=== T4: bağlantılar (kaynak) ===');
iddia('menü + sayfa + rol görünürlüğü', HTML.includes('id="nav-sicak-satis"') && HTML.includes('id="page-sicakSatis"') && HTML.includes("nav.style.display = sicakSatisGorunur() ? '' : 'none';"));
iddia('goPage kapısı + render', HTML.includes("if (id === 'sicakSatis' && !sicakSatisGorunur())") && HTML.includes("if (id === 'sicakSatis') { renderAdaylar(); adaylarYenile(); }"));
iddia('girişte ve canlı tazelemede yükleniyor', (HTML.match(/adaylarYenile\(\)/g) || []).length >= 5);
iddia('müşteri formu dönüşüm bağlamını sıfırlıyor', HTML.includes("_adayDonusumId = null; // Sıcak Satış dönüşümü"));
iddia('dönüşüm: satıcı yolu (onayda)', HTML.includes("if (_adayDonusumId) { adayDonusumTamamla(_adayDonusumId, firma, true);"));
iddia('dönüşüm: admin yolu yalnız DOĞRULANDIKTAN sonra', (() => { const a = HTML.indexOf('if (!kanit) {'); const b = HTML.indexOf('if (yeniMi && _adayDonusumId)'); return a > 0 && b > a; })());
iddia('AI: güncel web arama aracı + Opus 5.5', HTML.includes("type: 'web_search_20260209'") && HTML.includes("model: 'claude-opus-5-5'"));
iddia('AI: pause_turn devamı', HTML.includes("r.data.stop_reason === 'pause_turn' && devam < (azamiDevam ?? 3)"));
const DY = fs.readFileSync(__dirname + '/../.github/workflows/deploy.yml', 'utf8');
iddia('backend: adaylar tablosu + route', DY.includes('CREATE TABLE IF NOT EXISTS adaylar') && DY.includes("app.put('/api/adaylar'"));
iddia('nginx: proxy_read_timeout 200s (nginx -t + geri alma)', DY.includes('proxy_read_timeout 200s') && /proxy timeout[\s\S]{0,400}GERI ALINDI/.test(DY));

console.log('\n' + (kaldi ? '❌ ' : '✅ ') + gecti + ' geçti, ' + kaldi + ' kaldı');
process.exit(kaldi ? 1 : 0);
