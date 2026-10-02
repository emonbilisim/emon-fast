# EMON FAST — Proje Durumu

> Son güncelleme: 2026-10-02
> Bu dosya projenin yaşayan özetidir. **Her commit/güncellemeyle birlikte güncellenir**
> (bkz. `CLAUDE.md`): "Son Değişiklikler" bölümüne satır eklenir, gerekirse diğer bölümler düzeltilir.

## Genel Bakış

**EMON FAST**, bir **satın alma acentesi / teklif yönetim paneli**dir. Müşteri taleplerini
alır, tedarikçilerden fiyat toplar (RFQ), kar marjı + kargo/nakliye ekleyerek satış fiyatı ve
teklif (PDF/mail) üretir; sipariş, kargo/fatura, tahsilat ve mail order ödemesine kadar süreci izler.

- **Mimari:** Tek dosyalık web uygulaması — `satin_alma_acentesi.html` (~1,6 MB, ~26.700 satır).
  HTML + CSS + vanilla JS hepsi tek dosyada.
- **Sunucu:** Hetzner Cloud · `fast.emon.com.tr` · Node süreci pm2 (`emonfast`) · PostgreSQL.
  80/443 yalnızca WireGuard VPN (10.0.0.0/24) üzerinden erişilebilir.
- **Backend:** Repoda değil; sunucudaki `server.js`. Değişiklikler `deploy.yml` içindeki
  "Patch backend" adımlarıyla CI'da enjekte edilir (SSH'ten elle yapıştırma kullanılmıyor).
- **Başlıca API'ler:** `/api/giris`, `/api/veri` (ana blob, full-replace + merge),
  `/api/kullanicilar`, `/api/gorevler`, `/api/mailorder`, `/api/tahsilat`, talep-no sequence,
  oto-talep durumu, AI proxy (Claude, `.env CLAUDE_API_KEY`), sistem-durum (disk/DB).
- **Yerel depolama:** `localStorage` önbellek + sunucu senkronu (kayıt bazlı merge, tombstone,
  Lamport damgası). Kota dolunca yerel kopya kapalı talepleri düşürerek küçülür.

## Roller

| Rol | Açıklama |
|-----|----------|
| `admin` 👑 | Tam yetki — fiyat onayı, ayarlar, kullanıcılar, entegrasyonlar, arşivleme/silme |
| `satıcı` 🧑‍💼 | Kendi talepleri/müşterileri; müşteri/tedarikçi değişiklikleri admin onayına gider |
| `operasyon` | Görev/operasyon takibi (2026-06) |
| `müşteri` | (sınırlı görünüm / portal talebi) |

İzin/Vekil: tatildeki satıcının işleri vekile devredilebilir.

## Başlıca Modüller

- **Talepler:** Elle, Excel yapıştırma/`.xlsx`, ya da **gelen maillerden otomatik** (Outlook taraması,
  AI ile ürün çıkarma, FW iç iletmeler, Excel ekleri, revizyon eşleştirme). Talep no `TLP-00001`
  biçiminde, sunucu-taraflı atomik sequence. Örnek ürün görselleri RFQ'ya eklenebilir.
- **RFQ / Tedarikçi teklifleri:** Tedarikçiye mail, yanıtı aynı zincirde okuma, AI fiyat çıkarımı,
  alternatif ürünler, "Stok Yok", son revize (indirim) isteme, bedava kargo eşiği, HP sarf iskontosu.
- **Satış fiyatlama & Fiyat onayı:** Müşteri hedef marjı, satır bazlı kargo, admin onayı + e-posta
  bildirimleri (`#talep=NO` derin link), **Away modu** (hedef marjın altı otomatik onaylanmaz).
- **Teklifler:** PDF/mail (müşteri döviz kuru tipi, ödeme şartı, teslim süresi), müşteri yanıtı
  taraması, otomatik hatırlatma (tur/kapsam; istemeyen müşteri kapatılabilir), revizyon.
- **Sipariş:** Tedarikçi sipariş modülü (tek/toplu, manuel/telefon), kargo & fatura, tamamlama maili.
- **Arşiv:** Tamamlanan/Karşılanamadı/Arşivlendi talepler; tamamlanmış talep yeniden açılabilir.
- **CRM:** Etkileşim, pipeline, müşteri/talep istatistikleri, yeni müşteri kazanımı (demo müşteriler hariç).
- **Görevler:** Ekip içi görev atama (ayrı `gorevler` tablosu).
- **Finans:** Mail Order (sanal KK ile tedarikçi ödemesi, onay akışı, kaşe) + **Tahsilat Takip Merkezi**.
- **Yönetim:** Sürüm bandı/otomatik yenileme (CalVer), hard reset, sunucu deposu kartı, tema.

## AI Satın Alma Akışı (uçtan uca)

1. **Gelen mail taraması → talep** (`otoTalepTara`): Outlook gelen kutusu (Graph) zaman pencereli +
   sayfalı okunur; periyodik çalışır. Claude (backend proxy, Haiku-first; PDF ayrıştırılamazsa Sonnet'e
   düşer — `_claudeAiCagirAkilli`) maili sınıflar: yeni talep / müşteri onayı / revizyon. Müşteri
   gönderen domainden eşleşir; kendi domainimiz asla müşteri sayılmaz, FW iç iletmelerde asıl talep
   sahibi gövdeden bulunur. Ürünler gövde + PDF + Excel eklerinden çıkarılır. Sonuç **taslak** olur,
   kullanıcı "Yeni Talep / Revizyon olarak al" ile onaylar. mailId tekilliği mükerrer talebi önler;
   AI yanıtı null ise mail işaretlenmez (sessiz yutulma düzeltmesi), tarama raporu görünür.
2. **Tedarikçi eşleştirme / RFQ** (`rfqEslesmeSkoruHesapla`, `rfqMailGonder`): Tedarikçi kartındaki
   ürün/marka metnine göre skor (kelime +2, marka +6) → öneri listesi; manuel ekleme, "Stok Yok",
   referans görseller. Talep no sunucuda kesinleştirildikten sonra RFQ maili gider (çakışma önlemi).
3. **Teklif ayrıştırma** (`maildenFiyatlariCikar`, `outlookTeklifleriKontrolEt`): Tedarikçi yanıtları
   yalnız ilgili talep no'lu mail zincirinden okunur (tam token eşleşmesi); yeni kişi kurumsal
   domainle tedarikçiye bağlanır. Claude birim fiyat + para birimi + alternatif ürün önerisi çıkarır
   (TR/EN sayı formatı kuralları, fiyat yoksa 0). Revize (indirim) yanıtları da içeri alınır.
4. **Fiyat karşılaştırma** (`teklifleriKarsilastir`): Fiyatlı teklif satırları ürün bazında yan yana;
   fiyatsız tedarikçi/satırlar katlanır, alternatifler ayrı satır. Seçilen maliyet → Satış Fiyatlama
   (müşteri hedef marjı, kargo, kur) → fiyat onayı → teklif PDF/mail (oto-talep zincirinde yanıt).
5. **Müşteri yanıtı** (`teklifYanitlariTara`): onay/revizyon mailleri taranır; onayla sipariş,
   tedarikçi siparişi, kargo/fatura ve tamamlama maili akışı devam eder.

## Yönetici Uzakta (Away) Modu

- Ayarlar'da `AYARLAR.awayMode` (global, sunucuda). Açıkken satıcının "onaya gönder"i admin
  beklemeden **otomatik onaylanır** (`🌙 Otomatik onay` notu, `otomatikOnay: true`, Lamport
  `fiyatOnaySira` damgası) ve admine bilgi maili gider (`otoOnayBildirimGonder`).
- **Marj kapısı:** Herhangi bir kalem müşteri hedef marjının altındaysa ya da marj hesaplanamıyorsa
  (fail-safe) otomatik onay **yapılmaz**, talep normal admin onayına düşer; satıcıya ve admin mailine
  sebep yazılır. Kapı, ekrandaki kırmızı marj uyarısıyla aynı koşuldan beslenir.
- Teklife dahil edilmeyen (hariç) kalemler marj kapısını tetiklemez.

## Talep Yeniden Açma / Kalem Seçme (2026-09-24, `a4f8859`)

- **Tamamlanmış talebi yeniden aç** (`tamamlandiGeriAl`): Arşivde "Tamamlandı" satırında ↩ butonu.
  Sevk kaydı (kargo, sipariş tarihi, fatura) silinmez, yalnız statü geri alınır; `t.yenidenAcildi`
  iz bırakır, onay ekranındaki sipariş-sonrası uyarı korunur. Müşterinin sonradan istediği ek
  kalemler için yeni tur açılır.
- **Teklife girecek kalem seçimi:** Satış tablosunda satır başına "teklife dahil" kutucuğu; seçim
  talebin üzerinde `t.satisKalemHaric` olarak tutulur (cihazlar arası senkron). Hariç kalem toplama,
  müşteri tablosu/PDF/onay çıktısına girmez, marj kapısını tetiklemez; satır ve fiyatı ekranda kalır.
- Aynı turda: kapalı (sevk edilmiş/arşivdeki) talebe gelen fiyat onayı artık çıkmaza girmiyor
  (`3c43818`, TLP-00237).

## Dış Servisler / CDN'ler

- Claude API — backend proxy üzerinden (Haiku-first maliyet optimizasyonu)
- `api.frankfurter.app` — döviz kurları
- `graph.microsoft.com` + `login.microsoftonline.com` — Outlook mail, OneDrive yedek, MS 365 SSO
  (tenant'ta kullanıcı onayı kapalı: yeni Graph izni = önce Azure'da admin consent)
- `kargo.aras.com.tr` / Yurtiçi takip
- SheetJS, jsPDF + autotable, JSZip — CDN (defer)

## Deploy & Operasyon

- `.github/workflows/deploy.yml` — `main`'e push'ta: `index.html` yedeği → HTML yükleme →
  backend patch adımları (veri-guard, build-guard, görevler, mailorder, tahsilat, talep görselleri,
  veri-delta, veri-etag, …) → rename + `pm2 restart` → nginx gzip.
- `.github/workflows/sertifika-kontrol.yml` — günlük SSL sertifika süresi kontrolü + alarm.
- `KURULUM-ACIL-DURUM.md` — acil durum / sıfırdan kurulum runbook'u.
- `tools/` — yedek doğrulama (`yedek-dogrula.sh`, cron), backend patch, regresyon testleri
  (`*-test.js`: senkron, delta, ETag, onay tüketimi, marj kapısı, hayalet satır, …).

## ⚠️ Bilinen Durumlar / Dikkat

- **`YENI_SENKRON_YOLU = false` (kill-switch, 2026-09-03):** Delta talep yazımı + ETag/304 kodu
  repoda ve backend'de var ama istemcide **kapalı**; tam gövde yolu kullanılıyor. Açmadan önce
  kimlikli yazım testi yapılmalı.
- Backend veri-guard küçülen tabloları reddeder; toplu silme/temizlik "kasten" bayraklarıyla ve
  partiler halinde yapılmalı.
- macOS güncellemesi WireGuard tünelini düşürebilir (config kaybolmaz, yeniden içe aktar).

## Son Değişiklikler

Yeni kayıtlar en üste eklenir.

### 2026-09
- `a4f8859` Tamamlanmış talebi yeniden açma + teklife girecek kalemleri seçme
- `3c43818` Kapalı talebe gelen fiyat onayı çıkmaza giriyordu (TLP-00237)
- `baa6cbf`…`1c316ea` Tedarikçi kartı ikizlenmesi + mezar taşı + guard-güvenli temizlik
- `e4db530` Satış fiyatlama tablosu tekliflerle birlikte tazelensin (TLP-00307)
- `ce8294e`, `8d70772` Manuel RFQ'da boş/mükerrer teklif satırı (TLP-00298/299)
- `c7d600f` Mükerrer müşteriler: veri-guard kilidi açıldı
- `2d84168` Şifreyle girişte MS 365 hesabı düşüyordu (mail gitmiyor/taranmıyor)
- `797d359` Onay verify-then-consume
- `60a4ceb`, `2e679c3`, `8179cba` Delta yazım + ETag (→ `0cd4337` kill-switch ile kapalı)
- `7aeaeac`, `f3cbabc` localStorage kotası → veri kaybı düzeltmesi
- `90d75bd` Away modunda hedef marj altı otomatik onaylanmıyor
- `72da14e`, `385de3b` Fiyatsız satırların gizlenmesi/katlanması

### 2026-08
- Tedarikçi sipariş modülü (`4f97bec`), manuel sipariş, alternatif ürün siparişi, son revize isteme
- Talep arşive alma (`bdc9280`), Talep karşılanamadı (`91141c7`), sıralama/arama (talep no)
- Fiyat onayı geri düşme düzeltmeleri (`a1c4a9f`…`a945936`, 413/satisTablosu)
- Hatırlatma istemeyen müşteri, sipariş sonrası fiyat revizesi, müşteri vadeli gün zorunlu
- Tedarikçi kondisyonu açık tekliflere yansıyor; RFQ alternatif düzeltmesi
- Sertifika günlük kontrol workflow'u (`7743010`); WireGuard client6/7

### 2026-07
- Finans: Mail Order genişletmeleri + **Tahsilat Takip Merkezi** (`d6dcb2c`, backend `/api/tahsilat`)
- Gelen mail taraması: sessiz yutulma, FW eşleştirme, zaman pencereli/sayfalı okuma, Excel ekleri
- Senkron sertleştirme: absence-delete clobber, MUSTERILER dedup, TALEPLER tombstone, uyarı bandı
- Talep görselleri / RFQ eki, sürüm numarası (CalVer) + hard reset, performans (defer, gzip)
- Teklif hatırlatma otomasyonu, RFQ onay snapshot, müşteri onayı kaybı düzeltmesi

### 2026-06
- Senkron: kayıt/alan bazlı merge, wipe korumaları, veri-guard + build-guard (backend)
- Mail Order modülü, İzin/Vekil, Görevler + operasyon rolü, HP sarf iskontosu
- Fiyat onayı e-posta bildirimleri + derin link, kargo/fatura + tamamlama maili
- CRM istatistik/kazanım panoları, demo müşteri tipi, açık tema
- MS 365 SSO → backend JWT, Claude API backend proxy, kullanıcı yönetimi auth tablosuna bağlandı
- Acil durum runbook'u + yedek doğrulama cron'u

### 2026-05 (25–31)
- CRM ilk sürüm, gelen maillerden otomatik talep (Faz 1–2), satıcı bazlı görünürlük
- Satıcı yetki kısıtlamaları + müşteri/tedarikçi değişikliklerinin admin onayına gitmesi
- Mobil uyum, AI maliyet optimizasyonu (Haiku-first)

## Açık / Sıradaki İşler

- [ ] Delta senkron yolunun kimlikli yazım testi → `YENI_SENKRON_YOLU` tekrar açılsın mı?
- [ ] RFQ maliyeti → müşteri `altKalemler` köprüsü (alternatif ürünler)
- [ ] Tedarikçi siparişinde kısmi sipariş açıkları
- [ ] Tedarikçi tarafında vadeli gün zorunluluğu
- [ ] `renderArsiv` / `renderTalepler` `TALEP_KAPALI_DURUMLAR` sabitini kullanmıyor
- [ ] Mail Order: tedarikçi formunun PDF/görsel olarak oto-doldurulması (kalan kısım)
