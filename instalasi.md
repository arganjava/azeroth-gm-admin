# 📝 Rangkuman Setup AzerothCore Server & MySQL 8.4 LTS

Dokumen ini merangkum seluruh konfigurasi, perbaikan error kompilasi, hingga optimasi server game **AzerothCore (WotLK 3.3.5a)** bertipe **5x PvP** menggunakan **MySQL 8.4 LTS** pada Ubuntu Server.

---

## 🛑 1. Penanganan Kendala Kompilasi & Dependensi

Selama proses build menggunakan `./acore.sh compiler build`, ditemukan dua kendala utama yang berhasil diselesaikan:

* **Kendala Kompiler Hilang:** Skrip bawaan membutuhkan *Clang*. Masalah diselesaikan dengan menginstal kompiler pendukung:
  ```bash
  sudo apt install clang -y
  ```
* **Error Konflik Library MySQL (16%):** Terjadi akibat *libmariadb-dev* bentrok dengan fungsi makro `mysql_ssl_mode` milik MySQL asli. Solusinya adalah membersihkan MariaDB dan memasang dev-kit resmi MySQL:
  ```bash
  sudo apt remove libmariadb-dev libmariadb-dev-compat -y && sudo apt autoremove -y
  sudo apt install libmysqlclient-dev -y
  rm -rf var/build/obj  # Hapus cache build yang korup
  ```

---

## 🗄️ 2. Konfigurasi Database & Migrasi Massal

Struktur database dibuat menggunakan user **global (`%`)** agar server database siap untuk kebutuhan production environment.

### Pembuatan Database & User (MySQL)
```sql
CREATE DATABASE acore_auth DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE acore_characters DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE acore_world DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'acore' IDENTIFIED BY 'PasswordAcoreSecureAnda';
GRANT ALL PRIVILEGES ON acore_auth.* TO 'acore'@'%';
GRANT ALL PRIVILEGES ON acore_characters.* TO 'acore'@'%';
GRANT ALL PRIVILEGES ON acore_world.* TO 'acore'@'%';
FLUSH PRIVILEGES;
```

### Metode Migrasi Terpusat (`cat`)
Seluruh file SQL dasar diimpor secara massal menggunakan metode penggabungan file terpusat:
```bash
cat data/sql/base/db_auth/*.sql > gabungan_auth.sql && mysql -u acore -p'PasswordAcoreSecureAnda' acore_auth < gabungan_auth.sql && rm gabungan_auth.sql
cat data/sql/base/db_characters/*.sql > gabungan_characters.sql && mysql -u acore -p'PasswordAcoreSecureAnda' acore_characters < gabungan_characters.sql && rm gabungan_characters.sql
cat data/sql/base/db_world/*.sql > gabungan_world.sql && mysql -u acore -p'PasswordAcoreSecureAnda' acore_world < gabungan_world.sql && rm gabungan_world.sql
```

---

## ⚙️ 3. Kustomisasi Server (PvP & 5x XP Rate)

Modifikasi diterapkan langsung pada file konfigurasi aktif di direktori `env/dist/etc/worldserver.conf`:

```ini
# Mengubah Tipe Server Menjadi PvP (1 = PvP)
GameType = 1

# Menyelaraskan XP Rate Menjadi 5x Lipat Lebih Cepat
Rate.XP.Kill = 5
Rate.XP.Quest = 5
Rate.XP.Explore = 5
```

---

## 🌐 4. Perbaikan Status Realm "Offline" (IP Mismatch)

Jika setelah login daftar pilihan realm menunjukkan status **Offline**, hal tersebut dikarenakan tabel routing database masih mengarah ke IP lokal server. Solusinya adalah memperbarui tabel `realmlist` dengan IP Publik VPS Anda:

```sql
USE acore_auth;
UPDATE realmlist SET address = 'IP_PUBLIC_VPS_ANDA' WHERE id = 1;
FLUSH PRIVILEGES;
```

Jangan lupa untuk membuka port firewall Ubuntu agar koneksi pemain tidak tertahan:
```bash
sudo ufw allow 8085/tcp
```

---

## 🚀 5. Manajemen Perintah Running (Background Session)

Gunakan utility `screen` untuk memastikan kedua aplikasi biner tetap aktif di latar belakang (background) setelah sesi SSH terminal ditutup.

* **Menjalankan Authserver:**
  ```bash
  screen -S auth
  cd ~/azerothcore-wotlk/env/dist/bin && ./authserver
  # Tekan CTRL+A kemudian D untuk detach
  ```
* **Menjalankan Worldserver:**
  ```bash
  screen -S world
  cd ~/azerothcore-wotlk/env/dist/bin && ./worldserver
  # Tekan CTRL+A kemudian D untuk detach
  ```
* **Membuat Akun Administrator Game:**
  Masuk ke screen world server (`screen -r world`), lalu ketik perintah pada prompt `AC>`:
  ```text
  AC> account create namauser passworduser
  AC> account set gmlevel namauser 3 -1
  ```

***
*Dokumen ini merupakan panduan final yang valid untuk arsitektur server AzerothCore Anda saat ini.*
