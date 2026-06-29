# EMON FAST — Acil Durum / Sıfırdan Kurulum Talimatnamesi

> Amaç: sunucu kaybında (Hetzner çökmesi vb.) uygulamayı **yeni bir sunucuda** (ör. şirketin
> sanal sunucusu) en hızlı ve eksiksiz şekilde ayağa kaldırmak.
> Son güncelleme: 2026-06-29.

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
