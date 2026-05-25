# EMON FAST — Proje Durumu

> Son güncelleme: 2026-05-25
> Bu dosya projenin yaşayan özetidir. Önemli değişikliklerden sonra güncelleyin.

## Genel Bakış

**EMON FAST**, bir **satın alma acentesi / teklif yönetim paneli**dir. Müşteri taleplerini
alır, tedarikçilerden fiyat toplar, kar marjı + kargo/nakliye ekleyerek satış fiyatı ve
teklif (PDF) üretir.

- **Mimari:** Tek dosyalık web uygulaması — `satin_alma_acentesi.html` (~783 KB, ~11.800 satır).
  HTML + CSS + vanilla JS hepsi tek dosyada.
- **Sunucu:** Hetzner Cloud · `fast.emon.com.tr` · Node süreç pm2 (`emonfast`) ile yönetiliyor.
- **Backend API:** `window.location.origin` üzerinden — `/api/giris` (login), `/api/veri`
  (veri oku/yaz). Bu repoda yalnızca frontend HTML var; backend sunucuda.
- **Yerel depolama:** `localStorage` (44+ kullanım) ana veri katmanı; sunucu API'si ile senkron.

## Roller

| Rol | Açıklama |
|-----|----------|
| `admin` 👑 | Tam yetki — fiyat onayı, ayarlar, şirket bilgileri, entegrasyonlar |
| `satıcı` 🧑‍💼 | Talep/fiyat girişi. Müşteri kar marjı, ayarlar, entegrasyonlar gizli |
| `müşteri` | (sınırlı görünüm) |

## Başlıca Özellikler

- **Talep yönetimi:** Yeni talep açma, Excel/tablo yapıştırma, `.xlsx` yükleme.
- **Döviz kurları:** `frankfurter.app` üzerinden sistem kurları. Tek döviz görüntüleme
  (USD/EUR/TRY). Teklif kuru sistem kurundan otomatik dolar, manuel güncellenebilir.
- **Fiyatlandırma:** Kar marjı, müşteri hedef marjı karşılaştırması, satır bazlı kargo
  (3 mod: standart / proje paylaşımı / tüm satırlara uygula), gerçek maliyet hesabı.
- **Tedarikçi yönetimi:** Ekle/düzenle, Excel aktar/yükle, şablon indir.
- **AI fiyat çıkarımı:** Outlook mail + PDF içeriğinden Claude API (`api.anthropic.com`)
  ile fiyat okuma. Kullanıcı kendi API key'ini girer.
- **Onay akışı:** Admin fiyat onayı (tablodaki değerleri düzenleyip onaylayabilir),
  çoklu cihaz senkronu, **Away (uzakta) modu** — açıkken satıcı talepleri otomatik onaylanır.
- **Yedekleme:** Export/Import + günlük lokal snapshot + OneDrive otomatik yedek
  (Microsoft Graph App Folder, 4 saatte bir).
- **Teklif PDF:** jsPDF + autotable ile üretim.
- **Entegrasyonlar:** Microsoft 365 (Graph/MSAL — mail oku/gönder), Aras Kargo sorgulama.

## Dış Servisler / CDN'ler

- `api.anthropic.com/v1/messages` — AI fiyat çıkarımı
- `api.frankfurter.app/latest` — döviz kurları
- `graph.microsoft.com` + `login.microsoftonline.com` — Outlook mail, OneDrive yedek
- `kargo.aras.com.tr` — kargo takip
- SheetJS (xlsx), jsPDF + autotable, JSZip — CDN'den yükleniyor

## Deploy

`.github/workflows/deploy.yml` — `main`'e push'ta otomatik:
1. Sunucuda mevcut `index.html` yedeklenir (`.bak`)
2. `satin_alma_acentesi.html` SCP ile yüklenir → `index.html` olarak rename edilir
3. `pm2 restart emonfast`

## Repo Notları

- `README.md` neredeyse boş (sadece başlık).
- `client2-5.conf` — WireGuard config dosyaları (untracked). `.DS_Store` ile birlikte
  `.gitignore`'a eklenmeli; repoya girmemeli.

## Son Commitler (referans)

- `55724ff` Talep açılışında müşteri marjını her zaman otomatik getir
- `d58b249` Away (uzakta) modu: açıkken satıcı talepleri otomatik onaylanır
- `82d9259` Tek döviz görüntüleme modu (USD/EUR/TRY)
- `de2579b` Teklif kuru: sistem kurlarından otomatik doldur + Güncelle butonu
- `d2456d9` Teklif kuru: EUR ürünleri de manuel kura dahil

## Açık / Sıradaki İşler

- [ ] (buraya devam edilecek işleri ekleyin)
