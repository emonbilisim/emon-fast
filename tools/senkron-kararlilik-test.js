// EMON FAST — senkron/merge veri-kaybı kararlılık testi (regresyon aracı)
// Çalıştır: node tools/senkron-kararlilik-test.js
// Gerçek merge fonksiyonlarını satin_alma_acentesi.html'den çıkarıp düşmanca
// çok-kullanıcı/çok-cihaz senaryolarıyla sürer. İnvariant: VERİ KAYBI YOK + ÇOĞALMA YOK.
const fs=require('fs'), path=require('path');
const HTML=path.join(__dirname,'..','satin_alma_acentesi.html');
const html=fs.readFileSync(HTML,'utf8');
function ekstrakt(fn){
  const re=new RegExp('^function '+fn+'\\(','m');
  const i=html.search(re); if(i<0) throw new Error('bulunamadı: '+fn);
  // fonksiyon gövdesini ilk sütundaki "}" ile kapat
  const sub=html.slice(i); const satirlar=sub.split('\n'); let out=[];
  for(const s of satirlar){ out.push(s); if(s==='}') break; }
  return out.join('\n');
}
const FNS=['_onaySiraYeni','_canon','_mkey','_kayitBirlestir','_mergeDizi','_mergeMusteriler','_mergeObje','_adminSahipli','_onayKey','_mergeKaydet'];
let aktifKullanici={rol:'admin',ad:'selim'}, _sunucuBaz={};
let _silinenTalepNolar=new Set(),_silinenMusteriFirmalar=new Set(),_silinenTedarikciKeyler=new Set(),_silinenCrmIdler=new Set(),_silinenTeklifSatir=new Set();
eval(FNS.map(ekstrakt).join('\n\n'));
const clone = o => JSON.parse(JSON.stringify(o));
let pass=0, fail=0; const fails=[];
function ok(c,msg){ if(c){pass++;} else {fail++;fails.push(msg);console.log('  ✗ FAIL:',msg);} }

// boş tam-veri iskeleti
const bos = () => ({
  TALEPLER:[], MUSTERILER:[], TEDARIKCILER:[], CRM_AKTIVITELER:[],
  ONAY_BEKLEYENLER:{musteriler:[],tedarikciler:[],_tombstone:{}},
  talepTeklifleri:{}, TALEP_TOMBSTONE:{}, KULLANICILAR:[], AYARLAR:{}, FP_KURALLAR:[],
  talepSayac:0, crmSayac:0
});
// merge'i push gibi çağır: (local, server, base)
const push = (local, server, base) => _mergeKaydet(clone(local), clone(server), clone(base), false);

console.log('=== ODAKLI SENARYOLAR ===');

// S1: bayat istemci — başka kullanıcının EKLEDİĞİ talebi düşürmemeli
{
  const base = bos();                                   // ikisi de boş başladı
  const server = bos(); server.TALEPLER=[{no:'T-1',urun:'A',durum:'yeni'}]; // B ekledi
  const local = bos();                                 // A hâlâ boş (görmedi), başka alan düzenledi
  local.AYARLAR={x:1};
  const r = push(local, server, base);
  ok(r.TALEPLER.find(t=>t.no==='T-1'), 'S1: bayat istemci başkasının talebini düşürmedi');
}
// S2: iki kullanıcı AYNI kaydın FARKLI alanlarını düzenledi → ikisi de kalmalı
{
  const base = bos(); base.MUSTERILER=[{firma:'F',adres:'eski',telefon:'000'}];
  _sunucuBaz = clone(base);
  const server = bos(); server.MUSTERILER=[{firma:'F',adres:'YENI-ADRES',telefon:'000'}]; // B: adres
  const local  = bos(); local.MUSTERILER=[{firma:'F',adres:'eski',telefon:'999-YENI'}];    // A: telefon
  const r = push(local, server, base);
  const m = r.MUSTERILER.find(x=>x.firma==='F');
  ok(m && m.telefon==='999-YENI', 'S2: A telefon düzenlemesi korundu');
  ok(m && m.adres==='YENI-ADRES', 'S2: B adres düzenlemesi (dokunulmayan alan) korundu');
}
// S3: kargo alanı — başka kullanıcının eklediği kargoGonderi düşmemeli (asıl olay)
{
  const base = bos(); base.TALEPLER=[{no:'T-2',durum:'onay', kargoGonderi:{kod:'K123'}}];
  _sunucuBaz=clone(base);
  const server = bos(); server.TALEPLER=[{no:'T-2',durum:'onay', kargoGonderi:{kod:'K123'}}];
  const local  = bos(); local.TALEPLER=[{no:'T-2',durum:'onay', not:'ahmet'}]; // bayat: kargo yok, not ekledi
  const r = push(local, server, base);
  const t = r.TALEPLER.find(x=>x.no==='T-2');
  ok(t && t.kargoGonderi && t.kargoGonderi.kod==='K123', 'S3: kargoGonderi alanı absence-clobber olmadı');
}
// S4: gerçek talep silme → düşmeli, geri gelmemeli
{
  const base = bos(); base.TALEPLER=[{no:'T-3'},{no:'T-4'}];
  _silinenTalepNolar = new Set(['T-3']);
  const server = bos(); server.TALEPLER=[{no:'T-3'},{no:'T-4'}];
  const local  = bos(); local.TALEPLER=[{no:'T-4'}]; // A T-3 sildi
  const r = push(local, server, base);
  ok(!r.TALEPLER.find(t=>t.no==='T-3'), 'S4: açıkça silinen talep düştü');
  ok(r.TALEPLER.find(t=>t.no==='T-4'), 'S4: diğer talep korundu');
  _silinenTalepNolar = new Set();
}
// S5: RFQ maliyet — bayat istemci başkasının doldurduğu satırı ezmemeli + concurrent satır
{
  const base = bos(); base.talepTeklifleri={ 'T-5':[{tedarikci:'S1',birimFiyat:0}] };
  const server = bos(); server.talepTeklifleri={ 'T-5':[{tedarikci:'S1',birimFiyat:100}] };   // B doldurdu
  const local  = bos(); local.talepTeklifleri={ 'T-5':[{tedarikci:'S1',birimFiyat:0},{tedarikci:'S2',birimFiyat:50}] }; // A: S2 ekledi
  const r = push(local, server, base);
  const rows = r.talepTeklifleri['T-5'];
  ok(rows.find(x=>x.tedarikci==='S1')?.birimFiyat===100, 'S5: B RFQ satırı (S1=100) korundu');
  ok(rows.find(x=>x.tedarikci==='S2')?.birimFiyat===50,  'S5: A RFQ satırı (S2=50) korundu');
}
// S6: tedarikçi — bayat istemci başkasının eklediğini düşürmemeli
{
  const base=bos(); base.TEDARIKCILER=[['S1','a','b','c','d']];
  const server=bos(); server.TEDARIKCILER=[['S1','a','b','c','d'],['S2','x','y','z','w']]; // B ekledi
  const local=bos(); local.TEDARIKCILER=[['S1','a','b','c','d']]; // A görmedi
  const r=push(local,server,base);
  ok(r.TEDARIKCILER.length===2, 'S6: bayat istemci tedarikçiyi düşürmedi');
}
// S7: CRM — bayat istemci düşürmemeli; açık silme çalışmalı
{
  const base=bos(); base.CRM_AKTIVITELER=[{id:1}];
  const server=bos(); server.CRM_AKTIVITELER=[{id:1},{id:2}];
  const local=bos(); local.CRM_AKTIVITELER=[{id:1}];
  let r=push(local,server,base);
  ok(r.CRM_AKTIVITELER.length===2, 'S7: bayat istemci CRM kaydını düşürmedi');
}
// S8: TALEPLER boş-clobber koruması (bu _veriPush'ta; burada union'ın kaydı koruduğunu test et)
{
  const base=bos(); base.TALEPLER=[{no:'T-9'}];
  const server=bos(); server.TALEPLER=[{no:'T-9'},{no:'T-10'}];
  const local=bos(); // A tamamen boş açıldı (bayat localStorage), hiçbir şey silmedi
  const r=push(local,server,base);
  ok(r.TALEPLER.find(t=>t.no==='T-10'), 'S8: boş bayat local başkasının talebini silmedi (union)');
}
// S9: JSONB anahtar-sırası — aynı veri farklı sırayla "değişmiş" sanılmamalı
{
  const base=bos(); base.MUSTERILER=[{firma:'F',odeme:{havale:true,kk:false}}];
  _sunucuBaz=clone(base);
  const server=bos(); server.MUSTERILER=[{firma:'F',odeme:{kk:false,havale:true}}]; // sadece anahtar sırası farklı (JSONB)
  const local=bos(); local.MUSTERILER=[{firma:'F',odeme:{havale:true,kk:false},yeni:'A-EKLEDI'}]; // A yeni alan ekledi
  const r=push(local,server,base);
  const m=r.MUSTERILER.find(x=>x.firma==='F');
  ok(m && m.yeni==='A-EKLEDI', 'S9: JSONB sıra farkı yüzünden A düzenlemesi kaybolmadı');
}
// S10: müşteri mükerrer collapse (positional churn'ü katlamamalı)
{
  const base=bos(); const server=bos(); const local=bos();
  server.MUSTERILER=[{firma:'F'},{firma:'F'},{firma:'F'}]; // sunucuda 3× mükerrer
  base.MUSTERILER=[{firma:'F'}]; local.MUSTERILER=[{firma:'F'}];
  const r=push(local,server,base);
  ok(r.MUSTERILER.filter(m=>m.firma==='F').length===1, 'S10: müşteri mükerrerleri 1\'e collapse');
}
// S11: TALEP TOMBSTONE (C) — A siler, B AYNI ANDA düzenler → silme otoriter, re-inject YOK
{
  const base=bos(); base.TALEPLER=[{no:'Z',durum:'y'}];
  // A sildi: tombstone damgası sunucuda
  const server=bos(); server.TALEP_TOMBSTONE={'Z':Date.now()}; // TALEPLER'de Z yok (A sildi)
  // B eşzamanlı düzenledi (base'inde Z var, düzenleyip gönderiyor)
  const local=bos(); local.TALEPLER=[{no:'Z',durum:'B-DUZENLEDI'}];
  const r=push(local,server,base);
  ok(!r.TALEPLER.find(t=>t.no==='Z'), 'S11: tombstone silinen talebi concurrent-edit\'e rağmen düşürdü (re-inject YOK)');
  ok(r.TALEP_TOMBSTONE && ('Z' in r.TALEP_TOMBSTONE), 'S11: tombstone senkronda korunuyor');
}
// S12: tombstone 21 GÜNDEN eski → budanır (talep no tekrar kullanılabilir olsun)
{
  const base=bos(); const server=bos(); const local=bos();
  server.TALEP_TOMBSTONE={'ESKI':Date.now()-22*24*3600*1000}; // 22 gün önce
  local.TALEPLER=[{no:'ESKI',durum:'yeni-talep'}]; // aynı no yeniden kullanıldı
  const r=push(local,server,base);
  ok(r.TALEPLER.find(t=>t.no==='ESKI'), 'S12: 21g\'den eski tombstone budandı, yeni talep yaşıyor');
  ok(!('ESKI' in (r.TALEP_TOMBSTONE||{})), 'S12: eski tombstone girişi silindi');
}

// S13: FİYAT ONAYI — aynı no'lu ÇİFT kayıt, admin'in onayını silmemeli.
// Regresyon: onay çakışma çözümü Map'i yalnız t.no ile kuruyordu → çift kayıtta SON kayıt
// kazanıp durumunu aynı no'lu TÜM kayıtlara yazıyordu. Bayat 'bekliyor' ikizi admin'in yeni
// onayını her push'ta siliyor, talep onay listesine tekrar tekrar düşüyordu.
{
  const T0 = 1786096800000;
  const tal = o => Object.assign({no:'TLP-1',musteri:'Acme',urun:'X'}, o);
  const onayli   = tal({fiyatOnayDurumu:'onaylandi', fiyatOnaySira:T0+60000, fiyatOnayTalep:{adminTarih:'x'}});
  const bekleyen = tal({musteri:'Acme A.Ş.', fiyatOnayDurumu:'bekliyor', fiyatOnaySira:T0, fiyatOnayTalep:{satici:'ali'}});
  // her iki SIRALAMA da aynı sonucu vermeli (konum bazlı anahtar → sıra-bağımsız karar)
  [[onayli,bekleyen],[bekleyen,onayli]].forEach((dizilim, i) => {
    const base=bos(); base.TALEPLER=clone(dizilim);
    const server=bos(); server.TALEPLER=clone(dizilim);
    const local=bos();  local.TALEPLER=clone(dizilim);
    const r=push(local,server,base);
    const onayliSayi = r.TALEPLER.filter(t=>t.fiyatOnayDurumu==='onaylandi').length;
    ok(onayliSayi===1, 'S13.'+i+': çift kayıtta admin onayı korundu (ikiz onu ezmedi)');
  });
}
// S14: FİYAT ONAYI — admin onayı ardışık turlarda KALICI olmalı (tekrar onaya düşmesin)
{
  const T0 = 1786096800000;
  const tal = o => Object.assign({no:'TLP-2',musteri:'Acme',urun:'X'}, o);
  let server=bos(); server.TALEPLER=[
    tal({fiyatOnayDurumu:'bekliyor', fiyatOnaySira:T0, fiyatOnayTalep:{satici:'ali'}}),
    tal({musteri:'Acme A.Ş.', fiyatOnayDurumu:'bekliyor', fiyatOnaySira:T0, fiyatOnayTalep:{satici:'ali'}}),
  ];
  for (let tur=1; tur<=3; tur++) {
    const local=clone(server), base=clone(server);
    local.TALEPLER[0].fiyatOnayDurumu='onaylandi';
    local.TALEPLER[0].fiyatOnaySira=T0+tur*60000;
    local.TALEPLER[0].fiyatOnayTalep={adminTarih:'t'+tur};
    server=push(local,server,base);
  }
  ok(server.TALEPLER[0].fiyatOnayDurumu==='onaylandi', 'S14: onay 3 tur sonunda hâlâ onaylı (geri düşmedi)');
}
// S15: FİYAT ONAYI — karar damgası karşı tarafın (ileri) saatini de geçmeli (clock skew).
// _onaySiraYeni Lamport mantığı: satıcının saati ileriyse bile admin'in yeni kararı kazanır.
{
  const ileri = Date.now() + 10*60000;           // satıcı cihazı 10 dk ileri
  const t = {no:'TLP-3', fiyatOnayDurumu:'bekliyor', fiyatOnaySira:ileri};
  ok(_onaySiraYeni(t) > ileri, 'S15: yeni karar damgası ileri saatli damgayı geçiyor');
  const t2 = {no:'TLP-4'};                        // damgasız kayıt
  ok(_onaySiraYeni(t2) >= Date.now(), 'S15: damgasız kayıtta damga duvar saatinden küçük değil');
}

console.log(`  → ${pass} geçti, ${fail} başarısız`);

// ============ ÇOK-TURLU RASTGELE CHURN SİMÜLASYONU ============
// N istemci, ortak sunucu. Her tur bir istemci düzenleyip push eder (merge).
// Invariant: commit'lenen hiçbir kayıt SEBEPSİZ kaybolmaz / çoğalmaz.
console.log('\n=== ÇOK-TURLU CHURN SİMÜLASYONU ===');
// deterministik PRNG (Date.random yasak değil ama tekrarlanabilirlik için)
let _seed=1234567; const rnd=()=>{_seed=(_seed*1103515245+12345)&0x7fffffff; return _seed/0x7fffffff;};
const pick=a=>a[Math.floor(rnd()*a.length)];

function churn(clientCount, rounds){
  let server = bos();
  // her istemci: {base: son senkronladığı sunucu hali, mem: bellek}
  const clients = Array.from({length:clientCount},()=>({base:clone(server), mem:clone(server)}));
  const beklenen = new Map();  // no -> en son commit'lenen talep (silinmemişse mevcut olmalı)
  const silinmis = new Set();
  let idc=0;
  for(let t=0;t<rounds;t++){
    const ci = Math.floor(rnd()*clientCount); const c = clients[ci];
    const act = pick(['ekle','ekle','duzenle','duzenle','alan-ekle','sil','pull']);
    // reset global sil-setleri (oturum-içi; her istemci kendi)
    _silinenTalepNolar=new Set();
    if(act==='pull'){ c.mem=clone(server); c.base=clone(server); continue; }
    if(act==='ekle'){
      const no='T'+(idc++); c.mem.TALEPLER.push({no,urun:'U'+no,durum:'yeni',rev:0});
    } else if(act==='duzenle' && c.mem.TALEPLER.length){
      const tt=pick(c.mem.TALEPLER); tt.durum='d'+t; tt.rev=(tt.rev||0)+1;
    } else if(act==='alan-ekle' && c.mem.TALEPLER.length){
      const tt=pick(c.mem.TALEPLER); tt['alan_'+t]='v'+t; // yeni alan (absence-clobber riski)
    } else if(act==='sil' && c.mem.TALEPLER.length){
      const tt=pick(c.mem.TALEPLER); _silinenTalepNolar.add(String(tt.no));
      c.mem.TALEP_TOMBSTONE[String(tt.no)]=Date.now(); // senkronlanan tombstone (C) → re-inject'i kapatır
      c.mem.TALEPLER=c.mem.TALEPLER.filter(x=>x.no!==tt.no);
      silinmis.add(String(tt.no)); beklenen.delete(String(tt.no));
    }
    // push (merge server üstüne)
    const gonderilecek=_mergeKaydet(clone(c.mem), clone(server), clone(c.base), false);
    // _veriPush boş-clobber guard'ı benzeşimi: union zaten koruyor
    server=clone(gonderilecek);
    c.base=clone(gonderilecek); c.mem=clone(gonderilecek); // başarı: base+mem = gönderilen
    // beklenen kayıtları güncelle: sunucudaki tüm talepler (silinmemiş) beklenendir
    for(const tt of server.TALEPLER){ if(!silinmis.has(String(tt.no))) beklenen.set(String(tt.no), tt); }
  }
  return {server, beklenen, silinmis};
}

for(const [nc,nr] of [[3,300],[5,500],[8,800]]){
  _seed=99*nc+nr;
  const {server,beklenen,silinmis}=churn(nc,nr);
  const nolar=server.TALEPLER.map(t=>String(t.no));
  const set=new Set(nolar);
  // ★ ASIL İNVARIANT (veri kaybı): commit'lenen silinmemiş her talep MEVCUT olmalı
  const kayip=[...beklenen.keys()].filter(n=>!set.has(n));
  ok(kayip.length===0, `churn(${nc},${nr}): VERİ KAYBI YOK (${kayip.length} kayıp: ${kayip.slice(0,5)})`);
  // ★ ASIL İNVARIANT (çoğalma): mükerrer YOK
  const cift=nolar.length-set.size;
  ok(cift===0, `churn(${nc},${nr}): ÇOĞALMA YOK (${cift} mükerrer)`);
  // ★ İNVARIANT (C — tombstone): silinen talep EŞZAMANLI DÜZENLEME olsa bile geri gelmemeli (re-inject=0)
  const reinject=[...silinmis].filter(n=>set.has(n)).length;
  ok(reinject===0, `churn(${nc},${nr}): RE-INJECT YOK (tombstone silmeyi otoriter kıldı, ${reinject} ihlal)`);
  console.log(`  churn(${nc} istemci, ${nr} tur): ${server.TALEPLER.length} talep hayatta, ${silinmis.size} silme | KAYIP=${kayip.length} MÜKERRER=${cift} RE-INJECT=${reinject}`);
}

console.log(`\n=== TOPLAM: ${pass} geçti, ${fail} başarısız ===`);
if(fail){ console.log('BAŞARISIZLAR:'); fails.forEach(f=>console.log(' -',f)); }
process.exit(fail?1:0);
