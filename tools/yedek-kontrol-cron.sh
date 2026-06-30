#!/usr/bin/env bash
# EMON FAST — Günlük yedek doğrulama + BAŞARISIZLIKTA uyarı
# =========================================================================
# yedek-dogrula.sh'i çalıştırır; sonucu loglar; yedek EKSİK/BOZUK (exit!=0) ise
# e-posta (mail) veya webhook ile uyarı gönderir. Cron'dan çağrılmak içindir.
#
# Ortam değişkenleri (cron satırında verin):
#   BACKUP_DIR     yedek dizini            (vars: /var/backups/emonfast)
#   ALERT_EMAIL    uyarı gidecek e-posta   (vars: selim@emon.com.tr)
#   ALERT_WEBHOOK  (opsiyonel) HTTP POST hedefi (mail yoksa)
#   FRESH_DAYS     tazelik eşiği (gün)     (vars: 2)
#   LOG            log dosyası             (vars: /var/log/emonfast-yedek-kontrol.log)
#
# Kurulum/cron için: KURULUM-ACIL-DURUM.md → Adım 9.
# =========================================================================
set -uo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/emonfast}"
ALERT_EMAIL="${ALERT_EMAIL:-selim@emon.com.tr}"
FRESH_DAYS="${FRESH_DAYS:-2}"
LOG="${LOG:-/var/log/emonfast-yedek-kontrol.log}"

ts="$(date '+%Y-%m-%d %H:%M')"
host="$(hostname 2>/dev/null || echo '?')"

# Doğrulamayı çalıştır (renk kodlu çıktı), exit kodunu yakala
out="$(FRESH_DAYS="$FRESH_DAYS" bash "$DIR/yedek-dogrula.sh" "$BACKUP_DIR" 2>&1)"
code=$?
# Düz metin (mail/log için ANSI renk kodlarını temizle)
clean="$(printf '%s\n' "$out" | sed 's/\x1b\[[0-9;]*m//g')"

# Log
{ echo "===== [$ts] exit=$code  dizin=$BACKUP_DIR ====="; printf '%s\n' "$clean"; } >> "$LOG" 2>/dev/null

# Başarılıysa sessiz çık
[ "$code" -eq 0 ] && exit 0

# --- BAŞARISIZ → uyarı gönder ---
subject="EMON FAST YEDEK SORUNU ($ts @ $host)"
body="$(printf 'EMON FAST gunluk yedek dogrulamasi BASARISIZ.\nSunucu: %s\nDizin: %s\n\n%s\n' "$host" "$BACKUP_DIR" "$clean")"

if command -v mail >/dev/null 2>&1 && [ -n "$ALERT_EMAIL" ]; then
  printf '%s\n' "$body" | mail -s "$subject" "$ALERT_EMAIL" \
    && echo "[$ts] uyari e-postasi gonderildi: $ALERT_EMAIL" >> "$LOG" \
    || echo "[$ts] HATA: mail gonderilemedi (MTA kurulu mu? msmtp/postfix)" >> "$LOG"
elif [ -n "${ALERT_WEBHOOK:-}" ]; then
  curl -fsS "$ALERT_WEBHOOK" --data-urlencode "text=${subject}
${clean}" >/dev/null \
    && echo "[$ts] uyari webhook'a gonderildi" >> "$LOG" \
    || echo "[$ts] HATA: webhook gonderilemedi" >> "$LOG"
else
  echo "[$ts] UYARI: 'mail' komutu yok ve ALERT_WEBHOOK tanimsiz — uyari GONDERILEMEDI (yalniz log)." >> "$LOG"
fi

exit "$code"
