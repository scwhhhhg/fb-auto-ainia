# Bot Auto Komen & Posting Facebook v2.0

Selamat datang di generasi terbaru Bot Facebook! Ini adalah kumpulan skrip otomatisasi cerdas yang dirancang untuk memaksimalkan jangkauan Anda di Facebook. Bot ini dapat menjalankan berbagai tugas, mulai dari berkomentar di video dan grup hingga melakukan posting terjadwal ke banyak grup sekaligus.

Dijalankan sepenuhnya di cloud menggunakan **GitHub Actions**, bot ini dapat beroperasi 24/7 tanpa perlu menyalakan komputer Anda, menjadikannya alat yang sangat kuat untuk para blogger, digital marketer, dan siapa pun yang ingin meningkatkan *traffic* dan potensi monetisasi.

---

## 📜 Aturan Lisensi (PENTING!)

Sebelum menggunakan, harap pahami dan setujui aturan lisensi berikut:

* **Aktivasi Lisensi**: Lisensi Anda adalah **email** yang Anda gunakan saat melakukan pembelian.
* **Masa Aktif**: Satu kali pembelian lisensi berlaku selama **3 (tiga) bulan**.
* **Penggunaan Akun**: Satu lisensi dapat digunakan untuk **banyak akun Facebook** tanpa batas. Cukup ganti *cookies* di GitHub Secrets.
* **Larangan**: Dilarang keras **membagikan, menjual kembali, atau mendistribusikan ulang** kode bot ini kepada orang lain. Lisensi terikat pada pembeli.

➡️ **Link Pembelian Lisensi Resmi:** **[http://lynk.id/botxautomation/34kvz08g6oz1](http://lynk.id/botxautomation/34kvz08g6oz1)**

---

## ✨ Fitur Unggulan & Panduan Konfigurasi

#### **⭐ Integrasi Gemini AI untuk Komentar Cerdas (Fitur Baru!)**

Bot Komen Video, Grup, dan Teman sekarang dapat membuat komentar yang relevan secara otomatis!

* **Fungsi**: Jika diaktifkan, bot akan membaca caption postingan target dan mengirimkannya ke Google Gemini AI untuk dibuatkan komentar yang natural dan sesuai konteks.
* **Fallback API Key**: Bot akan membaca daftar kunci API dari `gemini_keys.txt`. Jika satu kunci gagal (error atau limit), bot akan otomatis mencoba kunci berikutnya di dalam daftar, membuatnya lebih andal.
* **Sisipan CTA**: Bot akan secara otomatis menambahkan link dari `cta_link.txt` di akhir setiap komentar yang dibuat oleh AI.
* **Cara Konfigurasi**:
    * **Aktifkan/Nonaktifkan**: Buka file `config` yang sesuai (misal: `configkomengroup.json`), cari bagian `ai_settings`, dan ubah `"enabled"` menjadi `true` atau `false`.
    * **Kunci API**: Buka `gemini_keys.txt` dan masukkan semua kunci API Gemini Anda, satu kunci per baris.
    * **Link CTA**: Buka `cta_link.txt` dan masukkan satu link yang ingin Anda promosikan.
    * **Edit Perintah AI**: Anda bisa mengubah `gemini_prompt` di dalam setiap file `config` untuk menyesuaikan gaya komentar yang dihasilkan AI.

### 1. Bot Auto Komen Video
* **File Bot:** `bot/autokomenvideo.js`
* **Fungsi:** Bot ini secara otomatis mencari dan mengomentari video di **Facebook Watch**. Sangat efektif untuk menjangkau audiens yang luas.
* **Fitur Anti-Duplikat:** Menggunakan URL video sebagai ID unik yang disimpan di `ceklink.txt` untuk memastikan tidak ada video yang dikomentari dua kali.

#### **Cara Konfigurasi:**
* **Target & Jeda Waktu**: Buka file `config/configkomenvideo.json` untuk mengatur jumlah komentar dan jeda waktu.
* **Isi Komentar**: Buka file `comments.txt` untuk mengatur isi komentar.

### 2. Bot Auto Komen Grup
* **File Bot:** `bot/autokomengroup.js`
* **Fungsi:** Bot ini secara cerdas mencari dan mengomentari postingan di **Feed Grup** Anda, cocok untuk menargetkan komunitas spesifik.
* **Fitur Anti-Duplikat:** Menggunakan (penanda posisi postingan) sebagai ID unik sementara untuk memastikan bot terus bergerak ke postingan selanjutnya dan tidak terjebak.

#### **Cara Konfigurasi:**
* **Target & Jeda Waktu**: Buka file `config/configkomengroup.json` untuk mengatur jumlah komentar dan jeda waktu.
* **Isi Komentar**: Gunakan file `comments.txt` yang sama untuk mengatur isi komentar.

### 3. Bot Auto Post Grup (Fitur Baru!)
* **File Bot:** `bot/postgroup.js`
* **Fungsi:** Fitur paling *powerful*! Bot ini akan **memposting konten secara berurutan** ke daftar grup yang telah Anda tentukan.
* **Konten Bervariasi**: Mengambil konten postingan dari `post_content.txt` secara berurutan dan berulang (*looping*), sehingga setiap grup bisa mendapatkan postingan yang berbeda.

#### **Cara Konfigurasi:**
* **Jeda Waktu**: Buka file `config/configpostgroup.json` untuk mengatur jeda waktu antar postingan dan jeda untuk pratinjau link.
* **Target Grup**: Buka file `target_groups.txt` dan masukkan semua URL grup target Anda, satu URL per baris.
* **Isi Postingan**: Buka file `post_content.txt` untuk mengatur semua variasi konten yang ingin Anda posting. Pisahkan setiap konten dengan `---`.

### 4. Bot Auto Komen Teman
* **File**: `bot/autokomenteman.js` & `config/configautokomenteman.json`
* **Fungsi**: Berinteraksi dengan postingan di **Feed Teman**.
* **Anti-Duplikat**: Menggunakan Anti Duplikat untuk memastikan bot terus bergerak ke postingan selanjutnya.

---

## 🛠️ Panduan Instalasi & Menjalankan Bot di GitHub Actions

Ikuti panduan ini langkah demi langkah. Proses ini hanya perlu dilakukan sekali di awal.

### **Prasyarat**

Sebelum memulai, pastikan Anda memiliki:
1.  **Akun GitHub**: Jika belum punya, daftar gratis di [github.com](https://github.com).
2.  **Browser & Ekstensi**: Google Chrome dengan ekstensi **Cookie-Editor** terpasang.

---

### **Langkah 1: Salin (Import) Repository ke Akun Anda**

Cara terbaik untuk menggunakan bot ini adalah dengan membuat salinan pribadi (private) melalui fitur *Import*.

1.  Login ke akun GitHub Anda.
2.  Pergi ke halaman **[GitHub Importer](https://github.com/new/import)**.
3.  Pada bagian **"Your old repository’s clone URL"**, masukkan link repository ini:
    ```
    [https://github.com/ffrancessco/autocommentfb](https://github.com/ffrancessco/autocommentfb)
    ```
4.  Pada bagian **"Repository name"**, beri nama untuk repository Anda (contoh: `bot-pribadi-saya`).
5.  Pilih **"Private"** agar hanya Anda yang bisa melihat dan mengakses bot ini.
6.  Klik **"Begin import"** dan tunggu beberapa saat hingga proses selesai. 

---

### **Langkah 2: Pengaturan GitHub Secrets (Paling Penting)**

Bot ini memerlukan dua "kunci rahasia" (Secrets) untuk bisa login dan tervalidasi.

1.  Buka repository yang baru saja Anda buat, lalu pergi ke tab **`Settings`**.
2.  Di menu sebelah kiri, navigasi ke **`Secrets and variables`** > **`Actions`**.
3.  Klik tombol **`New repository secret`** dan buat dua *secret* berikut satu per satu:

#### **Secret #1: Cookies Akun Facebook**
* **Nama**: `FACEBOOK_COOKIES`
* **Value**:
    1.  Di komputer Anda, buka browser Chrome dan **login ke akun Facebook** yang ingin Anda gunakan.
    2.  Klik ikon ekstensi **Cookie-Editor**.
    3.  Pilih **`Export`**, lalu pilih **`Export as JSON`**.
    4.  Klik **`Copy to Clipboard`**.
    5.  Tempelkan semua teks yang sudah disalin ke dalam kolom *Value* di GitHub.

#### **Secret #2: Lisensi Bot**
* **Nama**: `BOT_LICENSE_EMAIL`
* **Value**: Masukkan **email** yang Anda gunakan saat membeli lisensi bot.

---

### **Langkah 3: Konfigurasi Bot Sesuai Kebutuhan**

Edit file-file berikut langsung di GitHub untuk mengatur perilaku bot.

#### **A. Atur Target & Jeda Waktu**
* **Jika menjalankan Bot Komen Video:** Buka dan edit file `config/configkomenvideo.json`.
* **Jika menjalankan Bot Komen Grup:** Buka dan edit file `config/configkomengroup.json`.
* **Jika menjalankan Bot Posting Grup:** Buka dan edit file `config/configpostgroup.json`.

#### **B. Siapkan Konten & Target**
* **Untuk Komentar (`comments.txt`):** Isi dengan variasi komentar Anda. Pisahkan setiap komentar dengan `---` pada baris baru.
* **Untuk Posting (`post_content.txt`):** Isi dengan variasi konten postingan Anda. Pisahkan setiap konten dengan `---`.
* **Untuk Target Grup (`target_groups.txt`):** Isi dengan URL lengkap grup-grup target Anda, satu URL per baris.

---

### **Langkah 4: Menjalankan Bot Secara Manual**

Bot akan berjalan otomatis sesuai jadwal. Namun, Anda bisa menjalankannya secara manual kapan saja.

1.  Buka tab **`Actions`** di repository GitHub Anda.
2.  Di daftar workflow sebelah kiri, klik nama workflow Anda.
3.  Di sebelah kanan, akan muncul tombol **`Run workflow`**. Klik tombol tersebut, lalu klik tombol hijau **`Run workflow`** lagi untuk memulai.

Bot akan mulai berjalan, dan Anda bisa melihat lognya secara *real-time*. Selesai!

---

## ⚠️ **DISCLAIMER**

Penggunaan bot untuk mengotomatisasi aktivitas di platform media sosial **melanggar Ketentuan Layanan** mereka. Penggunaan bot ini dapat mengakibatkan pembatasan, pemblokiran sementara, atau bahkan penonaktifan permanen pada akun Facebook Anda.

Kode ini dibuat untuk **tujuan edukasi** mengenai otomatisasi web. **Anda bertanggung jawab penuh atas segala risiko dan konsekuensi** yang timbul dari penggunaan bot ini. Gunakan dengan bijak.
