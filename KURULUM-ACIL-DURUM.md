# EMON FAST — Acil Durum / Sıfırdan Kurulum Talimatnamesi

> Amaç: sunucu kaybında (Hetzner çökmesi vb.) uygulamayı **yeni bir sunucuda** (ör. şirketin
> sanal sunucusu) en hızlı ve eksiksiz şekilde ayağa kaldırmak.
> Son güncelleme: 2026-06-30.

---

## 🚨 ACİL DURUMDA İLK ADIMLAR — BURADAN BAŞLA

**Adım 0 — Panikleme, önce TEŞHİS koy (ilk 5 dk).** Önce şunu belirle: bu küçük bir arıza mı,
yoksa sunucu tamamen mi gitti? İkisinin yolu farklı.

```
Site açılmıyor.
   │
   ├─ Sunucuya SSH ile girebiliyor musun?  (ssh root@<IP>)
   │
   ├─ EVET → büyük ihtimal KÜÇÜK ARIZA → AŞAĞIDA "A" (tam kurulum GEREKMEZ, 5-15 dk)
   │
   └─ HAYIR / sunucu yok / Hetzner panelinde sunucu silinmiş
        → TAM FELAKET → AŞAĞIDA "B" (yeni sunucuya sıfırdan kurulum)
```

### A) Sunucu ayakta — önce bunları dene (çoğu olay burada biter)

```bash
ssh root@<SUNUCU_IP>
pm2 status                 # emonfast 'online' mı? değilse:
pm2 restart emonfast
pm2 logs emonfast --lines 40   # hata ne? (DB? port? kod?)
systemctl status nginx && nginx -t && systemctl reload nginx
systemctl status postgresql    # DB ayakta mı?
df -h                          # disk %100 dolu mu? (sık sebep)
```
- `pm2`/`nginx` yeniden başlatınca düzeliyorsa → **bitti**, B'ye gerek yok.
- DB hatası → `systemctl restart postgresql`.
- Disk doluysa → eski log/yedekleri temizle, sonra restart.

### B) Sunucu kayıp — sıfırdan kurulum (sırayla)

1. **ÖNCE yedeği DOĞRULA** (hiçbir şey kurmadan!) — en güncel yedek dizinini bul ve:
   ```bash
   bash tools/yedek-dogrula.sh /yedek/dizini
   ```
   - Hepsi ✔ ise devam et.
   - Kırmızı **x** varsa → o dosyayı (özellikle **server.js / .env / DB dump**) bulmadan kuruluma
     BAŞLAMA; eksikse OneDrive yedeği / eski sunucu snapshot'ı / başka kopya ara.
2. **Yeni sunucu hazırla** → Adım 2 (Node/PostgreSQL/nginx/pm2).
3. **DB'yi geri yükle** → Adım 3.
4. **server.js + .env + index.html + npm install** → Adım 4, sonra **pm2** → Adım 5.
5. **nginx + SSL** → Adım 6.
6. **DNS'i yeni IP'ye çevir + GitHub Secrets güncelle + `main`'e push** → Adım 7.
7. **Smoke test** (giriş, veri, yazma) → Adım 8.
8. **Günlük yedek + doğrulama cron'unu** yeniden kur → Adım 9.

**Sıra mantığı:** veri (DB) → kod (server.js) → çalıştır (pm2) → yayınla (nginx/SSL) →
yönlendir (DNS) → doğrula. Her adımın detayı aşağıda.

> ⏱️ Beklenen süre: yedek tamsa **~30-60 dk**. En çok DNS yayılması + SSL bekletir.
> Bu sırada kullanıcıları bilgilendir ("sistem bakımda, X dk içinde").

---

## 0. Mimari özeti (neyi kuruyoruz?)

EMON FAST iki parçadan oluşur:

1. **Frontend** — tek dosya: `satin_alma_acentesi.html` (bu repoda var). Sunucuda
   `/var/www/emonfast/public/index.html` olarak servis edilir.
2. **Backend** — Node/Express API (`/var/www/emonfast/server.js`) + **PostgreSQL**.
   pm2 ile `emonfast` adıyla çalışır. **⚠️ `server.js` BU REPODA YOK** — yalnızca
   sunucuda yaşar ve GitHub Actions (`deploy.yml`) ile yamalanır. Bu yüzden sıfırdan
   kurulum **yedekten** `server.js`'i geri yüklemeye dayanır.

Önünde nginx ters-vekil (reverse proxy) + Let's Encrypt SSL vardır. Alan adı:
**fast.emon.com.tr**.

---

## 1. ⚠️ ÖNCE: yedekte ne olmalı? (kontrol listesi)

Aşağıdakilerin **tümü** günlük yedekte (veya güvenli bir kasada) bulunmalı. Eksik varsa
kurulumdan ÖNCE tamamlayın:

- [ ] **PostgreSQL dump** — `emonfast` veritabanının `pg_dump` çıktısı (asıl veri burada).
- [ ] **`server.js`** — backend kodu (repoda yok!). En güncel, **yamalı** hali.
- [ ] **`.env`** — DB bilgileri + `JWT_SECRET` + `CLAUDE_API_KEY` (parolalar).
- [ ] **`package.json`** (+ varsa `package-lock.json`) — Node bağımlılıkları.
- [ ] **nginx site config** — `/etc/nginx/sites-available/emonfast` (veya benzeri).
- [ ] **SSL** — certbot ile yeniden alınabilir (ayrı yedek gerekmez), ama varsa
      `/etc/letsencrypt/` yedeği işi hızlandırır.
- [ ] **`satin_alma_acentesi.html`** — bu repoda zaten var (GitHub'dan da gelir).

> 💡 **Tavsiye:** `server.js`, `.env`, nginx config ve en güncel DB dump'ını şifreli bir
> kasada (parola yöneticisi / şifreli disk) ayrıca tutun. Bunlar repoda olmadığı için
> tek kopya sunucuda kalırsa felakette kaybolur.

> ✅ **Yedeği bu listeye göre OTOMATİK doğrulayın:**
> ```bash
> bash tools/yedek-dogrula.sh /yedek/dizini
> # Daha sıkı: gerçek deneme-yükleme ile
> TEST_RESTORE=1 bash tools/yedek-dogrula.sh /yedek/dizini
> ```
> Eksik/bayat/bozuk bir şey varsa kırmızı **x** ile listeler ve çıkış kodu `1` olur — bu
> komutu günlük cron'a koyup başarısızlıkta uyarı maili tetikleyebilirsiniz.

**Elinizde olması gereken erişimler:** yeni sunucuya `root` SSH; alan adı (DNS) yönetim
paneli; GitHub repo (emonbilisim/emon-fast) yönetici erişimi.

---

## 2. Yeni sunucu hazırlığı (Ubuntu 22.04/24.04 varsayımı)

```bash
# root olarak
apt update && apt upgrade -y
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs postgresql postgresql-contrib nginx git ufw
npm install -g pm2

# Güvenlik duvarı
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

---

## 3. PostgreSQL: veritabanı + kullanıcı + veriyi geri yükle

`.env`'deki değerleri kullanın (aşağıdakiler ÖRNEK — kendi `.env`'inizden doğrulayın):
`DB_NAME`, `DB_USER`, `DB_PASS`.

```bash
sudo -u postgres psql <<'SQL'
CREATE DATABASE emonfast;
CREATE USER emonfast_user WITH ENCRYPTED PASSWORD 'YEDEKTEKI_DB_PASS';
GRANT ALL PRIVILEGES ON DATABASE emonfast TO emonfast_user;
ALTER DATABASE emonfast OWNER TO emonfast_user;
SQL
```

Yedekteki dump'ı geri yükle (dump biçimine göre **birini** seç):

```bash
# Düz SQL dump ise:
sudo -u postgres psql emonfast < /yol/emonfast_YYYYMMDD.sql
# veya custom-format (.dump) ise:
sudo -u postgres pg_restore -d emonfast --no-owner /yol/emonfast_YYYYMMDD.dump
# Sahiplik:
sudo -u postgres psql -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO emonfast_user; \
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO emonfast_user;" emonfast
```

> Beklenen tablolar: `kullanicilar`, `musteriler`, `tedarikciler`, `talepler`, `ayarlar`,
> `audit_log`, `gorevler`, `oto_talep_durum`, `mailorder_kartlar`, `mailorder_formlar`,
> `mailorder_talepler` + `talep_no_seq`, `mailorder_no_seq` sequence'leri.
> (Eksik tablo/sequence olursa Adım 7'deki deploy bunları idempotent oluşturur.)

---

## 4. Uygulama dosyaları

```bash
mkdir -p /var/www/emonfast/public
cd /var/www/emonfast

# 1) Backend kodu — YEDEKTEN:
cp /yol/server.js        /var/www/emonfast/server.js
cp /yol/package.json     /var/www/emonfast/package.json   # yoksa Adım 4b
cp /yol/.env             /var/www/emonfast/.env

# 2) Frontend — GitHub'dan (veya yedekten):
git clone https://github.com/emonbilisim/emon-fast.git /tmp/emon-fast
cp /tmp/emon-fast/satin_alma_acentesi.html /var/www/emonfast/public/index.html

# 3) Bağımlılıklar:
cd /var/www/emonfast && npm install
```

**4b. `package.json` yedekte yoksa** (asgari bağımlılıklar):

```bash
cd /var/www/emonfast
npm init -y
npm install express pg bcryptjs jsonwebtoken dotenv
```

**`.env` içeriği** (yedekten gelmeli; örnek şablon):

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=emonfast
DB_USER=emonfast_user
DB_PASS=YEDEKTEKI_DB_PASS
JWT_SECRET=YEDEKTEKI_JWT_SECRET      # ⚠️ Değişirse tüm açık oturumlar düşer (kullanıcılar yeniden giriş yapar) — sorun değil
CLAUDE_API_KEY=YEDEKTEKI_CLAUDE_KEY  # AI fiyat çıkarımı; yoksa proxy 503 döner (kritik değil)
```

> `server.js`'in dinlediği **port**u doğrulayın (genelde `3000`). nginx bu porta vekil yapacak.

---

## 5. pm2 ile başlat

```bash
cd /var/www/emonfast
pm2 start server.js --name emonfast
pm2 save
pm2 startup            # çıktıdaki komutu çalıştır → sunucu yeniden başlayınca otomatik kalkar
pm2 logs emonfast --lines 30   # hata var mı bak (DB bağlantısı vb.)
```

Hızlı test (sunucu içinden):

```bash
curl -s http://localhost:3000/api/saglik     # {"...":"ok"} benzeri dönmeli (portu doğrula)
```

---

## 6. nginx + SSL

`/etc/nginx/sites-available/emonfast` (yedekten gelmiyorsa bu şablon):

```nginx
server {
    listen 80;
    server_name fast.emon.com.tr;

    root /var/www/emonfast/public;
    index index.html;

    # API → Node (portu server.js ile aynı yap)
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;     # uzun AI/PDF çağrıları için
        client_max_body_size 25m;    # büyük PDF/mail-order form yüklemeleri için
    }

    # SPA / statik HTML — her zaman taze gelsin (deploy sonrası eski sürüm takılmasın)
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "public, max-age=0";
    }
}
```

```bash
ln -sf /etc/nginx/sites-available/emonfast /etc/nginx/sites-enabled/emonfast
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# SSL (DNS Adım 7'de yeni IP'ye yönlendirildikten SONRA):
apt install -y certbot python3-certbot-nginx
certbot --nginx -d fast.emon.com.tr
```

---

## 7. DNS + GitHub Actions (deploy boru hattı)

1. **DNS:** Alan adı panelinde `fast.emon.com.tr` A kaydını **yeni sunucu IP**'sine yönlendirin.
   (Yayılma için biraz bekleyin; certbot'tan önce yayılmış olmalı.)

2. **GitHub Secrets** (repo → Settings → Secrets and variables → Actions) güncelle:
   - `SSH_HOST` → yeni sunucu IP'si
   - `SSH_PRIVATE_KEY` → yeni sunucunun root SSH özel anahtarı
   - `CLAUDE_API_KEY` → (varsa) Claude anahtarı

3. **Deploy'u tetikle:** `main` dalına küçük bir commit push'la (veya Actions'tan
   "Run workflow"). `deploy.yml`:
   - HTML'i `index.html` olarak yükler,
   - `server.js`'e tüm route yamalarını **idempotent** uygular (kullanıcı-sil, giris-ms,
     ai-proxy, talep-no/oto-talep, gorevler, mailorder/onay, veri-guard, build-guard),
   - eksik tablo/sequence'leri psql ile oluşturur,
   - `tedarikciler` boşsa seed eder,
   - `pm2 restart emonfast` yapar.

> Yedekten gelen `server.js` zaten yamalı olduğu için bu adım çoğunlukla "zaten var" deyip
> geçer; eksik bir şey varsa tamamlar. **GitHub Actions kullanılamıyorsa:** HTML'i elle
> `public/index.html`'e kopyalayın; dizi-koruma yaması için `tools/patch-backend.sh`'i
> sunucuda çalıştırın; diğer route'lar yedekteki `server.js`'te zaten mevcut olmalı.

---

## 8. Doğrulama (smoke test)

- [ ] `https://fast.emon.com.tr` açılıyor (SSL yeşil).
- [ ] `https://fast.emon.com.tr/api/saglik` yanıt veriyor.
- [ ] Bir kullanıcıyla **giriş** yapılıyor (admin: selim@emon.com.tr).
- [ ] Talepler / müşteriler / tedarikçiler **listeleniyor** (DB geri yüklendi).
- [ ] Yeni talep/değişiklik kaydet → sayfayı yenile → kalıcı (yazma çalışıyor).
- [ ] Microsoft 365 bağlantısı (topbar) → mail gönderimi (Azure app aynı kaldıysa sorunsuz).
- [ ] pm2 `pm2 startup` ile boot'ta otomatik kalkıyor.

---

## 9. Günlük yedeği yeniden kur

Yeni sunucuda günlük yedek cron'unu tekrar kurun (eski sunucudaki script yoksa örnek):

```bash
# /etc/cron.d/emonfast-backup  (her gün 03:00)
0 3 * * * postgres pg_dump emonfast > /var/backups/emonfast_$(date +\%Y\%m\%d).sql 2>/dev/null; \
find /var/backups -name 'emonfast_*.sql' -mtime +30 -delete
```

> Ayrıca uygulama içinde **OneDrive otomatik yedek** (Ayarlar) ve **Dışa Aktar/İçe Aktar**
> mevcut — bunlar veri-katmanı yedeğidir, sunucu kurulumunun yerini tutmaz.

### 9b. Yedeği her gün OTOMATİK doğrula + bozuksa UYARI maili

"Yedek alınıyor sanıp aslında bozuk/eksik" durumunu felaket gününden ÖNCE yakalamak için.

**1) Araçları sunucuya kopyala** (repoda; deploy etmiyor):

```bash
mkdir -p /opt/emonfast-tools
curl -fsSL https://raw.githubusercontent.com/emonbilisim/emon-fast/main/tools/yedek-dogrula.sh      -o /opt/emonfast-tools/yedek-dogrula.sh
curl -fsSL https://raw.githubusercontent.com/emonbilisim/emon-fast/main/tools/yedek-kontrol-cron.sh -o /opt/emonfast-tools/yedek-kontrol-cron.sh
chmod +x /opt/emonfast-tools/*.sh
```

**2) Mail gönderimi** (yeni sunucu varsayılan olarak mail YOLLAYAMAZ — basit MTA: msmtp):

```bash
apt install -y msmtp msmtp-mta
cat > /etc/msmtprc <<'EOF'
defaults
auth           on
tls            on
tls_starttls   on
logfile        /var/log/msmtp.log
account        emon
host           smtp.office365.com
port           587
from           bildirim@emon.com.tr
user           bildirim@emon.com.tr
password       UYGULAMA_PAROLASI     # M365 "uygulama parolası" (MFA varsa normal parola çalışmaz)
account default : emon
EOF
chmod 600 /etc/msmtprc
echo "test" | mail -s "EMON test" selim@emon.com.tr   # gelirse mail çalışıyor
```

> M365 kullanamıyorsanız: webhook ile uyarın → cron'da `mail` yerine
> `ALERT_WEBHOOK=https://...` verin (script otomatik webhook'a düşer).

**3) Cron** — her gün 04:30'da doğrula, bozuksa mail at:

```bash
cat > /etc/cron.d/emonfast-yedek-kontrol <<'EOF'
# dak saat * * *  kullanıcı  komut
30 4 * * * root BACKUP_DIR=/var/backups/emonfast ALERT_EMAIL=selim@emon.com.tr FRESH_DAYS=2 /opt/emonfast-tools/yedek-kontrol-cron.sh
EOF
```

> Test: `BACKUP_DIR=/var/backups/emonfast /opt/emonfast-tools/yedek-kontrol-cron.sh; echo "exit=$?"`
> — yedek tamsa sessiz `exit=0`; eksik/bozuksa mail gider + `exit=1`.
> Log: `/var/log/emonfast-yedek-kontrol.log`.

---

## 10. (Opsiyonel) WireGuard erişimi

Eski sunucuda yönetim WireGuard ile yapılıyordu (`client*.conf`, endpoint `:51820`).
Yeni sunucuda zorunlu değil; gerekirse `wireguard` kurup peer config'leri yeniden üretin.
Repodaki `client*.conf` dosyaları **gizli anahtar içerir, repoya GİRMEZ** (`.gitignore`'da).

---

## Hızlı özet (TL;DR)

1. Sunucu + Node/PostgreSQL/nginx/pm2 kur (Adım 2).
2. DB oluştur + dump'tan geri yükle (Adım 3).
3. `server.js`+`.env`+`package.json` yedekten, `index.html` GitHub'dan; `npm install` (Adım 4).
4. `pm2 start server.js --name emonfast` + `pm2 save/startup` (Adım 5).
5. nginx vekil + certbot SSL (Adım 6).
6. DNS'i yeni IP'ye çevir + GitHub Secrets güncelle + `main`'e push (Adım 7).
7. Smoke test (Adım 8) + günlük yedeği kur (Adım 9).

**En kritik bağımlılık:** yedekteki **`server.js` + `.env` + DB dump**. Bu üçü olmadan
kurulum tamamlanamaz — bunları repo dışında, şifreli, güncel tutun.
