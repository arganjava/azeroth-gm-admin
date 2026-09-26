# AzerothCore REST API

CMS karakter AzerothCore dengan UI React, REST API, lookup database karakter/item, dan eksekusi GM command melalui SOAP.

## Menjalankan

```sh
cp .env.example .env
npm install
npm start
```

Di terminal kedua, jalankan `npm run dev:web`, lalu buka `http://localhost:5173`.

REST API berjalan di `http://localhost:3000`; buka UI di `http://localhost:5173`. Isi koneksi auth, characters, world, token admin minimal 32 karakter acak, dan SOAP host/port pada `.env`. Ketiga database memakai host/user/password yang sama, tetapi nama schema dapat dikonfigurasi terpisah.

Aktifkan SOAP di `worldserver.conf` dengan `SOAP.Enabled = 1` dan pastikan alamat `SOAP.IP` mengizinkan host tempat REST API berjalan. Batasi port SOAP hanya ke host API; jangan ekspos langsung ke internet. UI mengirimkan token admin hanya ke REST API. Kredensial database dan akses SOAP tetap di server.

## Endpoint

- `GET /api/health` - cek API dan koneksi database
- `GET /api/realms` - daftar realm dari `realmlist`
- `POST /api/accounts` - membuat akun AzerothCore
- `POST /api/admin/session` - validasi token admin
- `GET /api/admin/characters?q=nama` - cari karakter
- `GET /api/admin/characters/:guid` - detail karakter dan equipment slot 0-18
- `GET /api/admin/items?q=nama-atau-id` - cari item
- `POST /api/admin/characters/:guid/level` - set level via GM command SOAP `levelup`
- `POST /api/admin/characters/:guid/items` - beri item via GM command SOAP `additem`
- `POST /api/admin/characters/:guid/money` - tambah/kurangi copper di database saat karakter offline

Endpoint `/api/admin/*` selain pembuatan session membutuhkan `Authorization: Bearer <CMS_ADMIN_TOKEN>`. Command level/item berjalan melalui SOAP. Command `.modify money` hanya bekerja pada karakter terpilih, sehingga API memperbarui saldo langsung dengan transaksi database dan menolak karakter yang sedang online. Item yang diberikan masuk ke bag; slot equipment hanya ditampilkan, tidak dipaksa equip.

Contoh body pembuatan akun:

```json
{
  "username": "PLAYER1",
  "password": "secret123",
  "email": "player@example.com"
}
```

Password tidak disimpan sebagai plaintext. API membuat `salt` dan `verifier` SRP6 sesuai implementasi AzerothCore, lalu menyimpan keduanya sebagai binary 32 byte.

Jangan mengekspos API ini ke internet tanpa HTTPS, firewall, dan autentikasi admin yang kuat.
