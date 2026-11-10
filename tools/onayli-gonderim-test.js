/* PANEL "✅ Fiyatınız Onaylandı — Müşteriye Gönderilmeyi Bekliyor" kartı.
   Şikâyet (2026-11-10): admin panelinde çok sayıda kayıt. Kök nedenler:
   (1) kart TÜM talepleri sayıyordu (sahiplik filtresi yok) → admin/satıcı herkesinkini görüyordu;
   (2) gönderim kaydı olmayan ama müşteriye ulaşmış teklifler (sipariş alınmış / elle iletildi)
       sonsuza dek takılı kalıyordu; sistem dışından gönderileni çıkarmanın yolu yoktu. */
const fs = require('fs');
const HTML = fs.readFileSync(__dirname + '/../satin_alma_acentesi.html', 'utf8');
const fnAl = ad => {
  const i = HTML.search(new RegExp('\\n(async )?function ' + ad + '\\(')) + 1;
  if (i <= 0) throw new Error(ad + ' yok');
  const ilk = HTML.slice(i, HTML.indexOf('\n', i));
  if (/\}\s*$/.test(ilk) && (ilk.match(/\{/g) || []).length === (ilk.match(/\}/g) || []).length) return ilk;
  return HTML.slice(i, HTML.indexOf('\n}\n', i) + 2);
};
let gecti = 0, kaldi = 0;
const iddia = (ad, k, ek) => { k ? (gecti++, console.log('  ✓ ' + ad)) : (kaldi++, console.log('  ✗ ' + ad + (ek !== undefined ? '  → ' + JSON.stringify(ek) : ''))); };

let aktifKullanici;
const TALEP_KAPALI_DURUMLAR = ['Tamamlandı','İptal','Reddedildi','Karşılanamadı','Arşivlendi'];
const fiyatOnayKapaliAsim = () => false;
const talepKapsamVekil = () => false;
eval(['talepKapaliMi','crmSiparisMi','onayliGonderimBekliyorMu','talepBenim','onayliGonderimBenim'].map(fnAl).join('\n'));

const g = (n) => new Date(Date.now() - n * 86400000).toISOString();
const onay = (ek) => ({ fiyatOnayDurumu: 'onaylandi', fiyatOnaySira: 5, fiyatOnayTalep: { adminTarih: g(3) }, durum: 'Teklif Hazır', ...ek });

console.log('\n=== T1: bekliyor mu? ===');
iddia('onaylı + hiç gönderilmemiş → BEKLİYOR', onayliGonderimBekliyorMu(onay()));
iddia('sistemden gönderilmiş (damga) → değil', !onayliGonderimBekliyorMu(onay({ musteriTeklifGonderildi: true, gonderilenOnaySira: 5 })));
iddia('gönderildikten sonra admin yeniden onayladı → BEKLİYOR', onayliGonderimBekliyorMu(onay({ musteriTeklifGonderildi: true, gonderilenOnaySira: 4 })));
iddia('★ sipariş alınmış, gönderim kaydı yok, onay siparişten ÖNCE → değil', !onayliGonderimBekliyorMu(onay({ durum: 'Sipariş Verildi', siparis: [{}], siparisTarih: g(1) })));
iddia('sipariş SONRASI admin revize onayı (kayıtsız) → BEKLİYOR (#TLP-00142)', onayliGonderimBekliyorMu(onay({ durum: 'Sipariş Verildi', siparis: [{}], siparisTarih: g(10) })));
iddia('★ durum elle "Müşteriye İletildi", kayıt yok → değil', !onayliGonderimBekliyorMu(onay({ durum: 'Müşteriye İletildi' })));
iddia('kapalı (arşiv) talep → değil', !onayliGonderimBekliyorMu(onay({ durum: 'Arşivlendi' })));
iddia('müşteri reddetti → değil', !onayliGonderimBekliyorMu(onay({ teklifDurumu: 'red' })));

console.log('\n=== T2: ★ kimin işi? ===');
aktifKullanici = { rol: 'admin', email: 'admin@emon.com.tr', id: 'a' };
iddia('admin: satıcının talebi kendi işi DEĞİL', !onayliGonderimBenim({ saticiEmail: 'ali@emon.com.tr' }));
iddia('admin: kendine atanmış talep işi', onayliGonderimBenim({ saticiEmail: 'ADMIN@emon.com.tr' }));
iddia('admin: sahipsiz eski kayıt işi', onayliGonderimBenim({}));
aktifKullanici = { rol: 'satici', email: 'ali@emon.com.tr', id: 's1' };
iddia('satıcı: kendi talebi', onayliGonderimBenim({ saticiEmail: 'ali@emon.com.tr' }));
iddia('★ satıcı: başka satıcının talebi GÖRMEZ (eskiden görüyordu)', !onayliGonderimBenim({ saticiEmail: 'veli@emon.com.tr' }));

console.log('\n=== T3: kaynak ===');
iddia('kart/rozet sahiplik filtreli', HTML.includes("const liste = tum.filter(({ t }) => onayliGonderimBenim(t));"));
iddia('admin için katlanmış "satıcılarda bekleyen" özeti', HTML.includes('👥 Satıcılarda gönderilmeyi bekleyen'));
iddia('"✓ Gönderildi" elle işaretleme damga yazıyor', /function onayliGonderildiIsaretle[\s\S]{0,900}gonderilenOnaySira = t\.fiyatOnaySira \|\| 0;[\s\S]{0,200}kaliciVeriKaydet/.test(HTML));
iddia('elle işaret siparişi geri düşürmüyor', /function onayliGonderildiIsaretle[\s\S]{0,700}if \(!\['Sipariş Verildi', 'Tamamlandı'\]\.includes\(t\.durum\)\)/.test(HTML));
console.log('\n' + (kaldi ? '❌ ' : '✅ ') + gecti + ' geçti, ' + kaldi + ' kaldı');
process.exit(kaldi ? 1 : 0);
