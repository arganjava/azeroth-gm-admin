# AzerothCore REST API

CMS karakter AzerothCore dengan UI React, REST API, lookup database karakter/item, dan eksekusi GM command melalui SOAP.

## Menjalankan

```sh
cp .env.example .env
npm install
npm start
```

Di terminal kedua, jalankan `npm run dev:web`, lalu buka `http://localhost:5173`.

REST API berjalan di `http://localhost:3000`; buka UI di `http://localhost:5173`. Isi koneksi auth, characters, world, token admin minimal 32 karakter acak, SOAP host/port, serta username/password akun AzerothCore GM level 3 pada `.env`. `SOAP_HOST` default ke `DB_HOST`; ubah jika worldserver berada di host lain.

Aktifkan SOAP di `worldserver.conf` dan restart worldserver:

```ini
SOAP.Enabled = 1
SOAP.IP = "0.0.0.0"
SOAP.Port = 7878
```

`SOAP.IP` adalah alamat bind listener, bukan alamat yang dipakai oleh API. Untuk dua mesin berbeda, bind ke `0.0.0.0` atau interface privat server, lalu izinkan TCP port 7878 hanya dari IP host API pada firewall server dan cloud security group. Verifikasi listener pada host worldserver dengan `ss -lntp | grep 7878`, lalu uji dari host API dengan `nc -vz <worldserver-host> 7878`. Jika keduanya satu host, bind dan targetkan `127.0.0.1`. SOAP mengautentikasi akun AzerothCore level 3 dengan Basic Auth. UI mengirimkan token admin hanya ke REST API; kredensial database dan SOAP tetap di server.

## Endpoint

- `GET /api/health` - cek API dan koneksi database
- `GET /api/realms` - daftar realm dari `realmlist`
- `POST /api/accounts` - membuat akun AzerothCore
- `POST /api/admin/session` - validasi token admin
- `GET /api/admin/accounts?q=username-atau-id` dan `GET /api/admin/accounts/:id` - cari akun dan daftar karakter
- `POST /api/admin/accounts/:id/logout` dan `POST /api/admin/accounts/:id/ban` - force logout dan ban akun
- `GET /api/admin/guilds?q=nama-atau-id` dan `GET /api/admin/guilds/:id` - cari guild, jumlah anggota, total uang karakter anggota, dan roster
- `GET /api/admin/characters?q=nama` - cari karakter
- `GET /api/admin/characters/:guid` - detail karakter, progression, equipment, dan inventory
- `GET /api/admin/items?q=nama-atau-id` - cari item
- `POST /api/admin/characters/:guid/level` - set level via GM command SOAP `levelup`
- `POST /api/admin/characters/:guid/items` - beri item via GM command SOAP `additem`
- `POST /api/admin/characters/:guid/items/remove` - kurangi item saat karakter offline
- `POST /api/admin/characters/:guid/money` - tambah/kurangi copper di database saat karakter offline
- `GET /api/admin/characters/:guid/money-logs` - riwayat perubahan saldo melalui CMS
- `POST /api/admin/characters/:guid/logout`, `/ban`, `/rename-flag`, dan `/title` - aksi karakter

Endpoint `/api/admin/*` selain pembuatan session membutuhkan `Authorization: Bearer <CMS_ADMIN_TOKEN>`. Command level/item berjalan melalui SOAP dan mendukung karakter online maupun offline. Untuk saldo offline, API memperbarui wallet dengan transaksi database. Untuk karakter online, API mengirim uang via `.send money` sebagai mail karena `.modify money` hanya menargetkan player yang sedang dipilih; pengurangan saldo online ditolak. Item yang diberikan masuk ke bag; slot equipment hanya ditampilkan, tidak dipaksa equip.

API membuat tabel `cms_money_logs` otomatis pada schema characters saat startup, sehingga user database memerlukan izin `CREATE` di schema tersebut. Perubahan saldo yang dilakukan sebelum tabel ini tersedia tidak tercatat; pengurangan inventory dibatasi untuk karakter offline.

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
