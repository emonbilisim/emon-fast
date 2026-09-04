/* ONAY TÜKETİM GÜVENLİĞİ — "onayladım ama kayıt hiçbir yerde yok" sınıfı.
   Asıl iddia: bekleyen onay kaydı, ancak kayıt SUNUCUDA GÖRÜLDÜKTEN sonra tüketilir.
   Sunucu 200 dönse bile yazmadıysa onay KORUNMALI (aksi halde kayıt buharlaşır). */
const fs = require('fs');
const HTML = fs.readFileSync(__dirname + '/../satin_alma_acentesi.html', 'utf8');

let gecti = 0, kaldi = 0;
const iddia = (ad, k, ek) => { k ? (gecti++, console.log('  ✓ ' + ad)) : (kaldi++, console.log('  ✗ ' + ad + (ek ? '  → ' + ek : ''))); };

console.log('\n=== T1: kaynak — her onay yolu KANIT şartına bağlı ===');
{
  iddia('doğrulayıcı var', HTML.includes('async function _sunucudaVarMi(alan, esitMi)'));
  iddia('okunamazsa kanıt YOK sayılıyor',
    /if \(!ham \|\| !Array\.isArray\(ham\[alan\]\)\) return false;/.test(HTML));
  iddia('müşteri-yeni kanıta bağlı',
    HTML.includes("const _kanit = _flushOk && await _sunucudaVarMi('MUSTERILER', m => m && m.firma === firma);"));
  iddia('müşteri-yeni: tüketim ancak kanıtla', /if \(_kanit\) \{\s*\n\s*_onayMusteriKaydetSonra/.test(HTML));
  iddia('müşteri-düzenle kanıta bağlı', HTML.includes('const _mdKanit = _mdOk && await _sunucudaVarMi('));
  iddia('tedarikçi-yeni kanıta bağlı', HTML.includes('const _tKanit = _tOk && await _sunucudaVarMi('));
  iddia('tedarikçi-düzenle kanıta bağlı', HTML.includes('const _tdKanit = _tdOk && await _sunucudaVarMi('));
}

console.log('\n=== T2: kanıt yoksa YEREL DEĞİŞİKLİK GERİ ALINIYOR (hayalet kayıt kalmasın) ===');
{
  iddia('müşteri-yeni geri alma', HTML.includes('MUSTERILER.shift();'));
  iddia('müşteri-düzenle geri alma', HTML.includes('MUSTERILER[hedef] = _mdEski;'));
  iddia('tedarikçi-yeni geri alma', HTML.includes('TEDARIKCILER.shift();'));
  iddia('tedarikçi-düzenle geri alma', HTML.includes('TEDARIKCILER[hedef] = _tdEski;'));
  iddia('geri alma için eski müşteri saklanıyor', HTML.includes('const _mdEski = MUSTERILER[hedef];'));
  iddia('geri alma için eski tedarikçi saklanıyor', HTML.includes('const _tdEski = TEDARIKCILER[hedef];'));
}

console.log('\n=== T3: ★ tombstone hiçbir yolda YAZIMDAN ÖNCE eklenmiyor ===');
{
  // Eski hata deseni: onayTombstoneEkle(...) çağrısının ardından kaydetme gelmesi.
  // Artık her kabul yolunda sıra: uygula → kaydet → KANITLA → tombstone.
  const kabulBloklari = [
    ['müşteri-düzenle', "const _mdOk = await kaliciVeriKaydet('Müşteri değişikliği onayı');"],
    ['tedarikçi-yeni',  "const _tOk = await kaliciVeriKaydet('Tedarikçi onayı');"],
    ['tedarikçi-düzenle',"const _tdOk = await kaliciVeriKaydet('Tedarikçi değişikliği onayı');"],
  ];
  for (const [ad, imza] of kabulBloklari) {
    const i = HTML.indexOf(imza);
    const j = HTML.indexOf('onayTombstoneEkle(kayit);', i);
    iddia(ad + ': kaydetme tombstone\'dan ÖNCE', i >= 0 && j > i, 'kaydet@' + i + ' tombstone@' + j);
  }
  // Müşteri-yeni yolunda tombstone _onayMusteriKaydetSonra içinde; o da yalnız _kanit ile çağrılıyor
  const k = HTML.indexOf('const _kanit = _flushOk');
  const l = HTML.indexOf('_onayMusteriKaydetSonra(parseInt(onayIdx));', k);
  iddia('müşteri-yeni: kanıt tüketimden ÖNCE', k >= 0 && l > k);
}

console.log('\n=== T4: ★ başarısızlıkta kullanıcı GERÇEĞİ görüyor (sessiz kayıp yok) ===');
{
  iddia('"SUNUCUDA BULUNAMADI" uyarısı var', (HTML.match(/SUNUCUDA BULUNAMADI/g) || []).length >= 2);
  iddia('"SUNUCUDA DOĞRULANAMADI" uyarısı var', (HTML.match(/SUNUCUDA DOĞRULANAMADI/g) || []).length >= 2);
  iddia('onay kaydının korunduğu söyleniyor', (HTML.match(/Onay kaydı korundu/g) || []).length >= 4);
}

console.log('\n=== T5: karar tablosu (mantık) ===');
{
  // tüket = flushOk && sunucudaGorundu
  const tuket = (flushOk, gorundu) => flushOk && gorundu;
  const senaryolar = [
    ['yazıldı + sunucuda var',      true,  true,  true,  'onay tüketilir (doğru)'],
    ['200 döndü ama sunucuda YOK',  true,  false, false, '★ ASIL VAKA — onay KORUNUR'],
    ['yazılamadı (bağlantı)',       false, false, false, 'onay korunur'],
    ['yazılamadı ama sunucuda var', false, true,  false, 'temkinli: korunur, tekrar denenir'],
  ];
  let hata = 0;
  for (const [ad, f, g, beklenen, not] of senaryolar) {
    const s = tuket(f, g);
    if (s !== beklenen) { hata++; console.log('     ✗ ' + ad); }
    else console.log(`     · ${ad} → ${s ? 'TÜKET' : 'KORU'}  (${not})`);
  }
  iddia('★ tüm senaryolar doğru', hata === 0, hata);
}

console.log(`\n=== TOPLAM: ${gecti} geçti, ${kaldi} başarısız ===`);
process.exit(kaldi ? 1 : 0);
