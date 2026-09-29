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

## Deploy dengan PM2

Frontend production dilayani pada port `4173`; request `/api` diteruskan oleh web process ke backend di `127.0.0.1:3000`. Build frontend sebelum menjalankan proses PM2:

```sh
npm run deploy:prod
npx pm2 status
npx pm2 save
npx pm2 startup
```

`deploy:prod` memasang semua dependency lokal, membangun frontend, lalu start/reload kedua proses PM2. Jalankan perintah yang dicetak oleh `npx pm2 startup` untuk mengaktifkan startup otomatis setelah reboot. UI tersedia di `http://<server>:4173`; arahkan reverse proxy HTTPS ke port tersebut. Simpan `.env` di server dan jangan masukkan kredensial ke file PM2.

Untuk deploy versi baru:

```sh
git pull
npm run deploy:prod
npx pm2 save
```

`ecosystem.config.js` mengelola `azeroth-api` dan `azeroth-web` sebagai proses terpisah. Ubah port atau host pada file itu jika konfigurasi server berbeda.

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
- `GET /api/admin/guilds` menampilkan semua guild; `GET /api/admin/guilds?q=nama-atau-id` mencari guild, dan `GET /api/admin/guilds/:id` menampilkan jumlah anggota, total uang karakter anggota, dan roster
- `GET /api/admin/characters?q=nama` - cari karakter
- `GET /api/admin/characters/:guid` - detail karakter, progression, equipment, dan inventory
- `GET /api/admin/characters/:guid/equipment-items?slot=0&q=nama` - pilihan item equipment yang cocok slot/race/class/level, beserta tier quality dan stat prioritas class
- `POST /api/admin/characters/:guid/equipment` - pasang item atau kosongkan slot equipment saat karakter offline
- `GET /api/admin/items?q=nama-atau-id` - cari item
- `POST /api/admin/characters/:guid/level` - set level via GM command SOAP `character level`
- `GET/POST /api/admin/characters/:guid/professions` - lihat dan ubah skill profesi yang sudah dipelajari (karakter harus offline)
- `GET/POST /api/admin/characters/:guid/skills` - lihat dan ubah skill karakter yang sudah dimiliki (nilai 0-450; karakter harus offline)
- `GET/POST /api/admin/characters/:guid/reputations` - lihat dan ubah standing faction (karakter harus offline)
- `POST /api/admin/characters/:guid/teleport` - simpan map dan koordinat karakter; karakter online di-force logout sebelum posisi diperbarui
- `POST /api/admin/characters/:guid/message` - broadcast pengumuman ke realm atau kirim pesan admin ke karakter online
- `POST /api/admin/characters/:guid/items` - beri item via GM command SOAP `additem`
- `POST /api/admin/characters/:guid/items/remove` - kurangi item saat karakter offline
- `POST /api/admin/characters/:guid/money` - tambah/kurangi copper di database saat karakter offline
- `GET /api/admin/characters/:guid/money-logs` - riwayat perubahan saldo melalui CMS
- `POST /api/admin/characters/:guid/logout`, `/ban`, `/rename-flag`, dan `/title` - aksi karakter

Endpoint `/api/admin/*` selain pembuatan session membutuhkan `Authorization: Bearer <CMS_ADMIN_TOKEN>`. Command level lewat SOAP mendukung karakter online maupun offline, sedangkan `.additem` memerlukan target online. Untuk saldo offline, API memperbarui wallet dengan transaksi database. Untuk karakter online, API mengirim uang via `.send money` sebagai mail karena `.modify money` hanya menargetkan player yang sedang dipilih; pengurangan saldo online ditolak. Equipment dapat diubah untuk karakter offline maupun online. Saat karakter online, UI meminta konfirmasi dan server melakukan force logout sebelum menyimpan perubahan agar state worldserver tidak menimpa database. Katalog equipment mengurutkan item dengan stat relevan bagi class lebih dulu tanpa menghilangkan item legal untuk build/spec berbeda. Tier quality ditampilkan memakai warna Common putih, Uncommon hijau, Rare biru, Epic ungu, dan Legendary oranye. Item equipment yang belum ada di tas dikirim sementara lewat `.send items`, lalu attachment dipindahkan ke slot equipment oleh API.

Pool database memakai TCP keepalive dan membuang koneksi idle/fatal agar koneksi terputus dapat dibuat ulang tanpa restart API. Reset koneksi saat request dibalas dengan HTTP 503; periksa status `/api/health` dan ulangi request setelah koneksi pulih. Client SOAP dibuat per command, jadi reset tidak merusak request berikutnya. Namun, jika koneksi reset setelah command mutatif dikirim, command mungkin sudah dijalankan; periksa keadaan karakter sebelum mengirim ulang agar item atau uang tidak terduplikasi. Teleport menyimpan map serta koordinat ke database; karakter online akan di-force logout terlebih dulu dan posisi baru berlaku saat login kembali. UI menyediakan pilihan map, landmark umum, dan koordinat manual X/Y/Z.

Pesan GM mendukung `announce` untuk broadcast sistem ke semua pemain online dan `send message` untuk menampilkan notifikasi admin ke karakter online yang sedang dibuka. Pesan langsung ini bukan whisper chat `/w` dan tidak dikirim ke karakter offline. Opsi General adalah broadcast realm, bukan pesan ke channel chat bernama General.

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
