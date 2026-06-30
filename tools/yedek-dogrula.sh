#!/usr/bin/env bash
# EMON FAST — Yedek Doğrulama (salt-okunur)
# =========================================================================
# Günlük yedeğin, acil durumda SIFIRDAN KURULUM için gereken kritik dosyaları
# gerçekten KAPSADIĞINI ve bunların GEÇERLİ/GÜNCEL olduğunu kontrol eder.
# Hiçbir şeyi değiştirmez. Eksik/bayat/bozuk bir şey varsa exit kodu != 0 olur
# (cron'a koyup başarısızlıkta uyarı maili tetiklemek için uygundur).
#
# Kullanım:
#   bash tools/yedek-dogrula.sh /yedek/dizini
#   BACKUP_DIR=/var/backups/emonfast bash tools/yedek-dogrula.sh
#   FRESH_DAYS=3 bash tools/yedek-dogrula.sh /yedek/dizini      # tazelik eşiği (gün)
#   TEST_RESTORE=1 bash tools/yedek-dogrula.sh /yedek/dizini    # DB'yi geçici DB'ye DENE-yükle (ağır)
#
# Aranan dosyalar (dizinde en yenisi; isimler env ile override edilebilir):
#   - DB dump : *.sql | *.sql.gz | *.dump | *.dump.gz   (DB_DUMP=...)
#   - server.js                                          (SERVER_JS=...)
#   - .env                                               (ENV_FILE=...)
#   - index.html | satin_alma_acentesi.html             (HTML_FILE=...)
#   - nginx conf (opsiyonel): *emonfast*nginx* | emonfast.conf  (NGINX_CONF=...)
# =========================================================================
set -uo pipefail

BACKUP_DIR="${1:-${BACKUP_DIR:-.}}"
FRESH_DAYS="${FRESH_DAYS:-2}"
TEST_RESTORE="${TEST_RESTORE:-0}"

c_ok=$'\033[32m'; c_warn=$'\033[33m'; c_err=$'\033[31m'; c_dim=$'\033[2m'; c_off=$'\033[0m'
PASS=0; WARN=0; FAIL=0
ok()   { echo "  ${c_ok}✔${c_off} $*"; PASS=$((PASS+1)); }
warn() { echo "  ${c_warn}!${c_off} $*"; WARN=$((WARN+1)); }
fail() { echo "  ${c_err}x${c_off} $*"; FAIL=$((FAIL+1)); }
hdr()  { echo; echo "▶ $*"; }

echo "EMON FAST yedek doğrulama — dizin: ${BACKUP_DIR}  (tazelik: ${FRESH_DAYS} gün)"

# En yeni eşleşen dosyayı bul (glob desenlerinden)
newest() {
  local newest="" f
  for f in "$@"; do
    [ -e "$f" ] || continue
    if [ -z "$newest" ] || [ "$f" -nt "$newest" ]; then newest="$f"; fi
  done
  printf '%s' "$newest"
}
# Tazelik: FRESH_DAYS içinde değişmiş mi? (GNU find — Linux sunucu)
taze() { [ -n "$(find "$1" -maxdepth 0 -mtime -"$FRESH_DAYS" 2>/dev/null)" ]; }
# Boyut (bayt)
boyut() { stat -c%s "$1" 2>/dev/null || stat -f%z "$1" 2>/dev/null || echo 0; }
# Dump'ı düz okumaya yardımcı (gz ise zcat)
oku() { case "$1" in *.gz) zcat "$1";; *) cat "$1";; esac; }

# ---- 1) PostgreSQL dump ------------------------------------------------
hdr "1) PostgreSQL dump (asıl veri)"
DB_DUMP="${DB_DUMP:-$(newest "$BACKUP_DIR"/*.sql "$BACKUP_DIR"/*.sql.gz "$BACKUP_DIR"/*.dump "$BACKUP_DIR"/*.dump.gz 2>/dev/null)}"
if [ -z "$DB_DUMP" ] || [ ! -e "$DB_DUMP" ]; then
  fail "DB dump bulunamadı (*.sql/.sql.gz/.dump). KRİTİK — veri olmadan kurulum yapılamaz."
else
  echo "  ${c_dim}dosya: $DB_DUMP ($(boyut "$DB_DUMP") bayt)${c_off}"
  [ "$(boyut "$DB_DUMP")" -gt 1024 ] && ok "dump boş değil" || fail "dump çok küçük/boş — bozuk olabilir"
  taze "$DB_DUMP" && ok "güncel (son ${FRESH_DAYS} gün)" || fail "BAYAT — ${FRESH_DAYS} günden eski (günlük yedek çalışmıyor olabilir)"
  # Beklenen tabloları içeriyor mu?
  bekle="kullanicilar musteriler tedarikciler talepler ayarlar"
  case "$DB_DUMP" in
    *.dump|*.dump.gz)  # custom format → pg_restore --list
      if command -v pg_restore >/dev/null 2>&1; then
        liste="$( (case "$DB_DUMP" in *.gz) zcat "$DB_DUMP" > /tmp/_emon_dump.$$ && pg_restore -l /tmp/_emon_dump.$$ 2>/dev/null; rm -f /tmp/_emon_dump.$$ ;; *) pg_restore -l "$DB_DUMP" 2>/dev/null;; esac) )"
        eksik=""; for t in $bekle; do echo "$liste" | grep -qiw "$t" || eksik="$eksik $t"; done
        [ -z "$eksik" ] && ok "beklenen tablolar mevcut" || fail "eksik tablo(lar):$eksik"
      else warn "pg_restore yok — custom dump içerik kontrolü atlandı"; fi
      ;;
    *)  # düz SQL
      icerik="$(oku "$DB_DUMP" | head -c 2000000)"
      eksik=""; for t in $bekle; do echo "$icerik" | grep -qiw "$t" || eksik="$eksik $t"; done
      [ -z "$eksik" ] && ok "beklenen tablolar dump'ta görünüyor" || warn "dump başında görünmeyen tablo(lar):$eksik (büyük dump'ta normal olabilir)"
      ;;
  esac
  if [ "$TEST_RESTORE" = "1" ]; then
    echo "  ${c_dim}TEST_RESTORE: geçici DB'ye deneme yükleme...${c_off}"
    tmpdb="emon_yedek_test_$$"
    if sudo -u postgres createdb "$tmpdb" 2>/dev/null; then
      if (case "$DB_DUMP" in *.dump*) oku "$DB_DUMP" | sudo -u postgres pg_restore -d "$tmpdb" --no-owner 2>/dev/null;; *) oku "$DB_DUMP" | sudo -u postgres psql -q "$tmpdb" >/dev/null 2>&1;; esac); then
        n="$(sudo -u postgres psql -tAc "SELECT count(*) FROM kullanicilar" "$tmpdb" 2>/dev/null || echo '?')"
        ok "deneme yükleme başarılı (kullanicilar: $n satır)"
      else fail "deneme yükleme HATA — dump bozuk olabilir"; fi
      sudo -u postgres dropdb "$tmpdb" 2>/dev/null
    else warn "geçici DB oluşturulamadı (postgres erişimi yok) — TEST_RESTORE atlandı"; fi
  fi
fi

# ---- 2) server.js ------------------------------------------------------
hdr "2) server.js (backend — REPODA YOK, yedek tek kaynak)"
SERVER_JS="${SERVER_JS:-$(newest "$BACKUP_DIR"/server.js "$BACKUP_DIR"/**/server.js 2>/dev/null)}"
if [ -z "$SERVER_JS" ] || [ ! -e "$SERVER_JS" ]; then
  fail "server.js bulunamadı. KRİTİK — backend kodu repoda yok, yalnızca yedekte!"
else
  echo "  ${c_dim}dosya: $SERVER_JS ($(boyut "$SERVER_JS") bayt)${c_off}"
  taze "$SERVER_JS" && ok "güncel" || warn "BAYAT — server.js son ${FRESH_DAYS} günde değişmemiş (kod nadiren değişir, normal olabilir)"
  grep -q "api/giris"  "$SERVER_JS" && ok "/api/giris var"  || fail "/api/giris yok — eksik/yanlış dosya"
  grep -q "api/veri"   "$SERVER_JS" && ok "/api/veri var"   || fail "/api/veri yok — eksik/yanlış dosya"
  grep -q "JWT_SECRET" "$SERVER_JS" && ok "JWT kullanımı var" || warn "JWT_SECRET referansı görünmüyor"
  # Enjekte route'lar (deploy yamaları): yedek güncel/yamalıysa bunlar olmalı
  for marker in "mailorder v1" "gorevler v1" "talep-no" "build-guard v1" "veri-guard v1"; do
    grep -q "$marker" "$SERVER_JS" && ok "yama mevcut: $marker" || warn "yama YOK: '$marker' — yedek eski olabilir (deploy yeniden uygular)"
  done
  node -c "$SERVER_JS" 2>/dev/null && ok "JS sözdizimi geçerli" || { command -v node >/dev/null && fail "JS sözdizim HATASI — bozuk server.js" || warn "node yok — sözdizimi kontrol edilemedi"; }
fi

# ---- 3) .env -----------------------------------------------------------
hdr "3) .env (DB parolası + JWT_SECRET + Claude key)"
ENV_FILE="${ENV_FILE:-$(newest "$BACKUP_DIR"/.env "$BACKUP_DIR"/**/.env 2>/dev/null)}"
if [ -z "$ENV_FILE" ] || [ ! -e "$ENV_FILE" ]; then
  fail ".env bulunamadı. KRİTİK — DB bağlantısı ve oturum imzası olmadan kurulum yapılamaz."
else
  echo "  ${c_dim}dosya: $ENV_FILE${c_off}"
  for k in DB_HOST DB_NAME DB_USER DB_PASS JWT_SECRET; do
    v="$(grep -E "^${k}=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
    if [ -n "$v" ]; then ok "$k tanımlı"; else fail "$k EKSİK/boş"; fi
  done
  grep -qE "^CLAUDE_API_KEY=." "$ENV_FILE" && ok "CLAUDE_API_KEY tanımlı" || warn "CLAUDE_API_KEY yok — AI fiyat çıkarımı çalışmaz (kritik değil)"
fi

# ---- 4) Frontend HTML --------------------------------------------------
hdr "4) Frontend (index.html / satin_alma_acentesi.html)"
HTML_FILE="${HTML_FILE:-$(newest "$BACKUP_DIR"/index.html "$BACKUP_DIR"/satin_alma_acentesi.html "$BACKUP_DIR"/**/index.html 2>/dev/null)}"
if [ -z "$HTML_FILE" ] || [ ! -e "$HTML_FILE" ]; then
  warn "HTML yedekte yok — sorun değil, GitHub repodan gelir (emonbilisim/emon-fast)."
else
  echo "  ${c_dim}dosya: $HTML_FILE ($(boyut "$HTML_FILE") bayt)${c_off}"
  [ "$(boyut "$HTML_FILE")" -gt 100000 ] && ok "HTML makul boyutta" || warn "HTML beklenenden küçük"
  grep -q "EMON" "$HTML_FILE" && ok "EMON FAST HTML'i görünüyor" || warn "içerik beklenenden farklı"
fi

# ---- 5) nginx conf (opsiyonel) ----------------------------------------
hdr "5) nginx config (opsiyonel — şablonla yeniden kurulabilir)"
NGINX_CONF="${NGINX_CONF:-$(newest "$BACKUP_DIR"/*emonfast*nginx* "$BACKUP_DIR"/emonfast.conf "$BACKUP_DIR"/nginx*.conf 2>/dev/null)}"
if [ -n "$NGINX_CONF" ] && [ -e "$NGINX_CONF" ]; then
  ok "nginx config yedekte var ($NGINX_CONF)"
else
  warn "nginx config yedekte yok — KURULUM-ACIL-DURUM.md Adım 6'daki şablonla kurulabilir."
fi

# ---- Özet --------------------------------------------------------------
echo
echo "──────────────────────────────────────────────"
echo "ÖZET:  ${c_ok}${PASS} geçti${c_off}  ·  ${c_warn}${WARN} uyarı${c_off}  ·  ${c_err}${FAIL} BAŞARISIZ${c_off}"
if [ "$FAIL" -gt 0 ]; then
  echo "${c_err}⛔ Yedek EKSİK/BOZUK — acil kurulum için yetersiz. Yukarıdaki ✗ maddelerini düzeltin.${c_off}"
  exit 1
elif [ "$WARN" -gt 0 ]; then
  echo "${c_warn}⚠ Yedek kullanılabilir ama uyarılar var — gözden geçirin.${c_off}"
  exit 0
else
  echo "${c_ok}✅ Yedek tam ve güncel — acil kurulum için hazır.${c_off}"
  exit 0
fi
