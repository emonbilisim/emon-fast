#!/usr/bin/env bash
# EMON FAST backend güvenlik yaması.
# POST /api/veri, müşteri/tedarikçi için "DELETE FROM ... + reinsert" (full-replace)
# yapıyor; if (TEDARIKCILER) boş dizide de truthy olduğu için bir istemci [] gönderince
# tüm tabloyu siliyordu. Bu yama: silme/yeniden-yükleme yalnızca DOLU dizi gelince çalışır.
# Sunucuda çalıştır:  bash patch-backend.sh
set -e
cd /var/www/emonfast
cp server.js "server.js.bak.$(date +%Y%m%d%H%M%S)"
sed -i 's/if (MUSTERILER) {/if (Array.isArray(MUSTERILER) \&\& MUSTERILER.length) {/' server.js
sed -i 's/if (TEDARIKCILER) {/if (Array.isArray(TEDARIKCILER) \&\& TEDARIKCILER.length) {/' server.js
grep -n "Array.isArray(MUSTERILER)\|Array.isArray(TEDARIKCILER)" server.js || { echo "! desen bulunamadı, elle kontrol et"; exit 1; }
pm2 restart emonfast
echo "✓ server.js yamalandı ve emonfast yeniden başlatıldı"
