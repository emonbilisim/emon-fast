/* AI kredisi bitti (2026-11-10): "Your credit balance is too low". Hesap/servis geneli hatalar
   gelen mail taramasında maili 3 denemede kalıcı "işlendi" yapıyordu → talep mailleri kayboluyordu. */
const fs = require('fs');
const HTML = fs.readFileSync(__dirname + '/../satin_alma_acentesi.html', 'utf8');
const fnAl = ad => { const i = HTML.search(new RegExp('\\n(async )?function ' + ad + '\\(')) + 1;
  return HTML.slice(i, HTML.indexOf('\n}\n', i) + 2); };
let gecti = 0, kaldi = 0;
const iddia = (ad, k, ek) => { k ? (gecti++, console.log('  ✓ ' + ad)) : (kaldi++, console.log('  ✗ ' + ad + (ek !== undefined ? '  → ' + JSON.stringify(ek) : ''))); };
let toast = 0; const showToast = () => toast++;
let _aiKrediUyariZamani = 0;
eval(fnAl('_aiHataKodu') + fnAl('_aiKrediUyarisi'));
eval(HTML.match(/const AI_SERVIS_HATALARI = new Set\([^)]*\);/)[0].replace('const ', 'var '));

console.log('\n=== T1: sınıflandırma ===');
const kredi = { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } };
iddia('★ kredi mesajı (400) → kredi', _aiHataKodu(400, kredi) === 'kredi');
iddia('kredi uyarısı bir kez gösterildi (10 dk tekrar yok)', (_aiHataKodu(400, kredi), toast === 1), toast);
iddia('401 → unauthorized', _aiHataKodu(401, null) === 'unauthorized');
iddia('429 → rate-limit', _aiHataKodu(429, null) === 'rate-limit');
iddia('529 overloaded → asiri-yuk', _aiHataKodu(529, null) === 'asiri-yuk');
iddia('isteğe özgü 400 (ör. bozuk PDF) → http-400 (servis hatası DEĞİL)', _aiHataKodu(400, { error: { message: 'Could not process PDF' } }) === 'http-400' && !AI_SERVIS_HATALARI.has('http-400'));
iddia('servis hataları kümesi', ['kredi','unauthorized','rate-limit','asiri-yuk','network','no-key'].every(k => AI_SERVIS_HATALARI.has(k)));

console.log('\n=== T2: ★ gelen mail taraması maili İŞARETLEMİYOR ===');
const i = HTML.indexOf("if (sonuc && sonuc._err && AI_SERVIS_HATALARI.has(sonuc._err)) {");
const blok = HTML.slice(i, HTML.indexOf('}', HTML.indexOf('break;', i)) + 1);
iddia('servis hatası dalı var ve 3-deneme sayacından ÖNCE', i > 0 && i < HTML.indexOf("const n = (cfg.aiHataSayac[m.id] || 0) + 1;"));
iddia('dalda işaretleme/sayaç YOK, tarama durur', blok.includes('break;') && !blok.includes('islenenMailIdler') && !blok.includes('aiHataSayac'));
iddia('rapor metni kredi durumunu söylüyor', HTML.includes("kredi: 'Anthropic kredisi bitti'"));
iddia('proxy + yerel yol sınıflandırıcıyı kullanıyor', (HTML.match(/_aiHataKodu\((env|r)\.status/g) || []).length >= 4);
console.log('\n' + (kaldi ? '❌ ' : '✅ ') + gecti + ' geçti, ' + kaldi + ' kaldı');
process.exit(kaldi ? 1 : 0);
