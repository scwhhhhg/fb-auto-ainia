# 🤖 FB Auto Tools - Complete Facebook Automation Suite

## 📖 Deskripsi
FB Auto Tools adalah suite lengkap bot otomatisasi Facebook generasi terbaru yang dirancang untuk memaksimalkan jangkauan, engagement, dan konten management di platform Facebook. Bot ini berjalan sepenuhnya di cloud menggunakan GitHub Actions dan dapat beroperasi 24/7 tanpa memerlukan komputer yang selalu menyala.

### ✨ Fitur Lengkap
- **🎥 Auto Scrape Reels**: Otomatis scraping dan download reels Facebook untuk reposting
- **💬 Auto Comment Video**: Otomatis mengomentari video di Facebook Watch
- **👥 Auto Comment Group**: Mengomentari postingan di grup Facebook secara cerdas
- **📢 Auto Posting Group**: Posting konten ke multiple grup secara berurutan
- **👫 Auto Comment Teman**: Berinteraksi dengan postingan di feed teman
- **📝 Auto Update Status**: Otomatis update status dengan konten yang bervariasi
- **🔄 Auto Share Reels**: Sharing reels ke timeline dan grup secara otomatis
- **🧠 AI-Powered Comments**: Integrasi dengan Google Gemini AI untuk komentar yang relevan dan natural
- **🚫 Anti-Duplicate System**: Mencegah duplikasi aktivitas dengan tracking yang cerdas
- **☁️ Cloud-Based**: Berjalan di GitHub Actions tanpa perlu server pribadi

---

## 🧠 Cara Kerja Bot

### Sistem Anti-Duplikat
Bot menggunakan beberapa metode tracking untuk mencegah aktivitas berulang:
- **Video Comments**: Menggunakan URL video sebagai ID unik yang disimpan di `ceklink.txt`
- **Group Comments**: Menggunakan penanda posisi postingan untuk memastikan bot bergerak ke postingan berikutnya
- **Reels Scraping**: Database reels yang sudah di-scrape untuk menghindari duplikasi
- **Status Updates**: Tracking status yang sudah diposting dengan timestamp
- **Shared Content**: ID tracking untuk konten yang sudah dishare

### AI Integration Workflow
1. **Content Analysis**: Bot membaca caption/konten postingan target
2. **AI Processing**: Mengirim konten ke Google Gemini AI dengan prompt yang telah dikonfigurasi
3. **Comment Generation**: AI menghasilkan komentar yang natural dan relevan
4. **CTA Integration**: Otomatis menambahkan link dari `cta_link.txt` ke setiap komentar
5. **Fallback System**: Jika satu API key gagal, bot mencoba key berikutnya dari daftar

---

## 🗂️ Struktur Proyek

```
fb-auto-ainia/
├── bot/                          # Core bot scripts
│   ├── autokomenvideo.js        # Video commenting automation
│   ├── autokomengroup.js        # Group commenting automation  
│   ├── postgroup.js             # Group posting automation
│   ├── autokomenteman.js        # Friend feed interaction
│   ├── autoscrapereels.js       # Reels scraping automation
│   ├── autoupdatestatus.js      # Status update automation
│   └── autosharereels.js        # Reels sharing automation
├── config/                       # Configuration files
│   ├── configkomenvideo.json    # Video comment settings
│   ├── configkomengroup.json    # Group comment settings
│   ├── configpostgroup.json     # Group posting settings
│   ├── configautokomenteman.json # Friend feed settings
│   ├── configscrapereels.json   # Reels scraping settings
│   ├── configupdatestatus.json  # Status update settings
│   └── configsharereels.json    # Reels sharing settings
├── data/                         # Data files
│   ├── comments.txt             # Comment variations
│   ├── post_content.txt         # Post content variations
│   ├── status_content.txt       # Status update variations
│   ├── target_groups.txt        # Target group URLs
│   ├── target_reels.txt         # Target accounts for reels scraping
│   ├── scraped_reels.txt        # Database of scraped reels
│   ├── shared_content.txt       # Tracking shared content
│   ├── ceklink.txt             # Video tracking database
│   ├── gemini_keys.txt         # AI API keys
│   └── cta_link.txt            # Call-to-action link
├── downloads/                    # Downloaded content storage
│   └── reels/                   # Downloaded reels storage
├── .github/workflows/           # GitHub Actions workflows
│   ├── scrape-reels.yml        # Reels scraping workflow
│   ├── update-status.yml       # Status update workflow
│   ├── share-reels.yml         # Reels sharing workflow
│   ├── comment-videos.yml      # Video commenting workflow
│   ├── comment-groups.yml      # Group commenting workflow
│   └── post-groups.yml         # Group posting workflow
└── README.md                    # Documentation
```

---

## ⚙️ Analisis Kode & Workflow Detail

### 1. 🎥 Auto Scrape Reels (`autoscrapereels.js`)
**Fungsi Utama:**
- Monitoring dan scraping reels dari akun target
- Download video reels untuk reposting
- Ekstraksi metadata (caption, hashtags, engagement)

**Workflow:**
1. Load target accounts dari `target_reels.txt`
2. Login dan navigasi ke profil target
3. Scan reels terbaru yang belum di-scrape
4. Download video dengan quality optimization
5. Ekstraksi caption dan metadata
6. Save to local storage dan update database
7. Anti-duplicate check dengan `scraped_reels.txt`

**Konfigurasi:**
```json
{
  "max_reels_per_account": 5,
  "download_quality": "720p",
  "scrape_delay": 10000,
  "storage_path": "./downloads/reels/",
  "metadata_extraction": true
}
```

### 2. 📝 Auto Update Status (`autoupdatestatus.js`)
**Fungsi Utama:**
- Posting status updates dengan konten bervariasi
- Scheduling dan timing optimization
- Hashtag dan mention integration

**Workflow:**
1. Load konten dari `status_content.txt` (rotasi dengan separator `---`)
2. Select content berdasarkan scheduler atau random
3. Process hashtags dan mentions
4. Post status ke timeline
5. Handle link previews dan media attachments
6. Update tracking database
7. Apply delay sebelum status berikutnya

**Konfigurasi:**
```json
{
  "posting_frequency": "daily",
  "posting_times": ["09:00", "15:00", "20:00"],
  "hashtag_limit": 10,
  "auto_mentions": true,
  "media_support": true
}
```

### 3. 🔄 Auto Share Reels (`autosharereels.js`)
**Fungsi Utama:**
- Sharing scraped reels ke timeline dan grup
- Caption modification dan optimization
- Cross-posting dengan targeting

**Workflow:**
1. Load reels dari storage `downloads/reels/`
2. Select reels yang belum dishare dari database
3. Generate atau modify caption dengan AI (opsional)
4. Share ke timeline pribadi
5. Cross-post ke target groups dari `target_groups.txt`
6. Handle engagement tracking (likes, comments)
7. Update `shared_content.txt` tracking
8. Clean up old files sesuai retention policy

**Konfigurasi:**
```json
{
  "share_to_timeline": true,
  "share_to_groups": true,
  "caption_modification": true,
  "engagement_tracking": true,
  "retention_days": 30,
  "sharing_delay": 15000
}
```

### 4. 💬 Bot Komen Video (`autokomenvideo.js`)
**Fungsi Utama:**
- Mencari video di Facebook Watch secara otomatis
- Menganalisis konten video untuk komentar yang relevan
- Sistem tracking berbasis URL untuk mencegah duplikasi

**Workflow:**
1. Login menggunakan cookies dari GitHub Secrets
2. Navigasi ke Facebook Watch
3. Ekstraksi daftar video yang tersedia
4. Cek database `ceklink.txt` untuk video yang belum dikomentari
5. Jika AI enabled, analisis caption video dengan Gemini AI
6. Generate atau pilih komentar dari `comments.txt`
7. Post komentar dan update tracking database
8. Lanjut ke video berikutnya dengan delay yang dikonfigurasi

### 5. 👥 Bot Komen Grup (`autokomengroup.js`)
**Fungsi Utama:**
- Scan feed grup untuk postingan terbaru
- Komentar cerdas dengan konteks postingan
- Anti-duplikat berbasis posisi postingan

**Workflow:**
1. Login dan navigasi ke grup feed
2. Identifikasi postingan yang belum dikomentari
3. Ekstraksi konten postingan untuk analisis AI
4. Generate komentar contextual menggunakan Gemini AI
5. Post komentar dengan delay random untuk terlihat natural
6. Update tracking untuk menghindari duplikasi

### 6. 📢 Bot Posting Grup (`postgroup.js`)
**Fungsi Utima:**
- Posting konten ke multiple grup secara berurutan
- Sistem rotasi konten untuk variasi
- Management delay untuk menghindari rate limiting

**Workflow:**
1. Load daftar grup dari `target_groups.txt`
2. Load konten dari `post_content.txt` (rotasi dengan separator `---`)
3. Loop melalui setiap grup target
4. Select konten berikutnya dari rotation pool
5. Post konten ke grup dengan delay yang dikonfigurasi
6. Handle link preview delay jika diperlukan
7. Lanjut ke grup berikutnya

### 7. 🧠 AI Integration System
**Komponen:**
- **Prompt Engineering**: Kustomisasi prompt di setiap config file
- **API Key Management**: Fallback system untuk multiple Gemini keys
- **Content Analysis**: Parsing dan preprocessing konten target
- **Response Processing**: Format dan integrate AI response dengan CTA

**Error Handling:**
- Automatic failover ke API key berikutnya
- Fallback ke komentar manual jika AI gagal
- Retry mechanism untuk network issues

---

## 🚀 Panduan Setup Lengkap

### Prasyarat
- Akun GitHub (gratis)
- Browser Chrome dengan ekstensi Cookie-Editor
- Email lisensi bot yang valid
- API keys Google Gemini (opsional untuk AI features)
- Storage space untuk downloaded reels (minimum 1GB)

### Langkah Setup

#### 1. Import Repository
```bash
# Via GitHub Importer
1. Buka https://github.com/new/import
2. Clone URL: https://github.com/scwhhhhg/fb-auto-ainia
3. Pilih "Private" untuk repository
4. Klik "Begin import"
```

#### 2. Setup GitHub Secrets
Navigasi ke Settings > Secrets and variables > Actions, tambahkan:

**FACEBOOK_COOKIES**
```
1. Login Facebook di Chrome
2. Buka Cookie-Editor extension  
3. Export > Export as JSON
4. Copy semua cookie data
5. Paste ke GitHub Secret
```

**BOT_LICENSE_EMAIL**
```
Email yang digunakan untuk pembelian lisensi
```

#### 3. Konfigurasi File Data

**Setup Target Files:**
```
# target_reels.txt - Target accounts untuk scraping reels
https://facebook.com/creator1
https://facebook.com/creator2

# target_groups.txt - URL grup target
https://facebook.com/groups/grup1
https://facebook.com/groups/grup2

# status_content.txt - Variasi konten status
Status pertama dengan hashtags #trending
---
Status kedua dengan mention @someone
---
Status ketiga dengan link website.com
```

**AI Settings (Opsional):**
```json
// Dalam file config (contoh: configkomengroup.json)
{
  "ai_settings": {
    "enabled": true,
    "gemini_prompt": "Buatkan komentar yang natural dan relevan berdasarkan konten ini:"
  }
}
```

**Setup Data Files:**
- `gemini_keys.txt`: Satu API key per baris
- `cta_link.txt`: Link yang akan ditambahkan di akhir komentar AI
- `comments.txt`: Variasi komentar manual (pisah dengan `---`)
- `post_content.txt`: Variasi konten posting (pisah dengan `---`)

#### 4. Menjalankan Bot
```bash
# Manual run via GitHub Actions
1. Buka tab "Actions" di repository
2. Pilih workflow yang diinginkan:
   - Scrape Reels Workflow
   - Update Status Workflow  
   - Share Reels Workflow
   - Comment Videos Workflow
   - Comment Groups Workflow
   - Post Groups Workflow
3. Klik "Run workflow"
4. Monitor log execution real-time
```

---

## 🔧 Konfigurasi Detail Per Bot

### Reels Scraping Bot
```json
{
  "max_reels_per_run": 10,
  "target_accounts_limit": 5,
  "download_quality": "720p",
  "scrape_delay": 12000,
  "storage_cleanup": true,
  "retention_days": 30,
  "metadata_extraction": {
    "captions": true,
    "hashtags": true,
    "engagement": true,
    "timestamp": true
  }
}
```

### Status Update Bot
```json
{
  "posting_schedule": {
    "enabled": true,
    "times": ["09:00", "15:00", "20:00"],
    "timezone": "Asia/Jakarta"
  },
  "content_rotation": true,
  "hashtag_integration": true,
  "max_hashtags": 10,
  "media_attachment": false,
  "posting_delay": 3600000
}
```

### Reels Sharing Bot
```json
{
  "share_targets": {
    "timeline": true,
    "groups": true,
    "pages": false
  },
  "caption_settings": {
    "modify_original": true,
    "add_credits": true,
    "ai_enhancement": true
  },
  "sharing_delay": 20000,
  "engagement_tracking": true,
  "cross_post_limit": 5
}
```

### Video Comment Bot
```json
{
  "max_comments": 10,
  "delay_between_comments": 5000,
  "target_categories": ["comedy", "trending", "viral"],
  "ai_settings": {
    "enabled": true,
    "gemini_prompt": "Custom prompt untuk video comments"
  }
}
```

### Group Comment Bot
```json
{
  "max_comments": 15,
  "delay_between_comments": 8000,
  "scroll_delay": 3000,
  "target_post_types": ["video", "photo", "text"],
  "ai_settings": {
    "enabled": true,
    "gemini_prompt": "Custom prompt untuk group comments"
  }
}
```

### Group Posting Bot
```json
{
  "posting_delay": 30000,
  "link_preview_delay": 5000,
  "max_posts_per_run": 5,
  "content_rotation": true,
  "scheduling": {
    "enabled": false,
    "preferred_times": ["10:00", "14:00", "19:00"]
  }
}
```

---

## 📊 Monitoring & Analytics

### Real-time Monitoring
- **Execution Logs**: GitHub Actions real-time logs untuk setiap workflow
- **Error Tracking**: Detailed error logging dengan debugging information
- **Performance Metrics**: Runtime statistics dan success rates
- **Rate Limiting**: Monitor API limits dan cooldown status

### Analytics Dashboard Data
```
Tracking Files:
├── ceklink.txt          # Video interaction database
├── scraped_reels.txt    # Reels scraping history  
├── shared_content.txt   # Content sharing tracker
├── status_history.txt   # Status update log
└── engagement_stats.txt # Performance analytics
```

### Storage Management
- **Downloads Folder**: Otomatis cleanup berdasarkan retention policy
- **Database Files**: Regular backup dan optimization
- **Log Rotation**: Prevent file size overflow

---

## 🔄 Workflow Automation Schedule

### Recommended Scheduling
```yaml
# GitHub Actions Cron Schedule
Scrape Reels: "0 */6 * * *"    # Setiap 6 jam
Update Status: "0 9,15,20 * * *" # 3x sehari
Share Reels: "0 11,17,21 * * *"  # 3x sehari offset
Comment Videos: "0 */4 * * *"   # Setiap 4 jam
Comment Groups: "0 */3 * * *"   # Setiap 3 jam  
Post Groups: "0 10,16,22 * * *" # 3x sehari
```

### Load Balancing
- **Staggered Execution**: Offset timing untuk menghindari resource conflict
- **Priority Queue**: Critical tasks get priority scheduling
- **Resource Monitoring**: Auto-scale based on GitHub Actions limits

---

## ⚠️ Penting: Keamanan & Compliance

### Lisensi & Usage Policy
- **Masa Aktif**: 3 bulan per pembelian lisensi
- **Multi-Account**: Satu lisensi untuk unlimited Facebook accounts
- **Distribusi**: Strictly prohibited - no sharing/reselling
- **License Validation**: Email-based activation system

### Legal & Risk Disclaimer
- ⚠️ **Terms of Service**: Bot activities may violate Facebook ToS
- ⚠️ **Account Risk**: Potential for temporary or permanent account suspension
- ⚠️ **Content Rights**: Ensure proper rights for scraped/shared content
- ⚠️ **Privacy**: Respect user privacy and data protection laws
- ⚠️ **Rate Limiting**: Facebook may impose stricter limits on automated accounts

### Security Best Practices
```
✅ Use dedicated test accounts, not main accounts
✅ Implement realistic delays to avoid bot detection
✅ Regular cookie rotation and IP management  
✅ Monitor account health and engagement metrics
✅ Backup all configurations and tracking data
✅ Use private repositories for sensitive data
✅ Enable 2FA on GitHub account
✅ Regular license key validation checks
```

---

## 🛠️ Troubleshooting Guide

### Common Issues & Solutions

#### **Authentication Errors**
```
Problem: Login failed atau session expired
Solution:
1. Update cookies di GitHub Secrets
2. Clear browser cache dan login ulang
3. Check account restrictions
4. Verify license email validity
```

#### **Scraping Issues**
```
Problem: Reels scraping gagal atau incomplete
Solution:
1. Check target account privacy settings
2. Verify storage permissions dan space
3. Update scraping delays
4. Check network connectivity
```

#### **AI Integration Problems**
```
Problem: Gemini AI not responding
Solution:
1. Verify API keys di gemini_keys.txt
2. Check API quota dan billing
3. Test fallback key rotation
4. Review prompt configuration
```

#### **Rate Limiting**
```
Problem: Too many requests error
Solution:
1. Increase delays di config files
2. Reduce batch sizes
3. Implement longer cooldowns
4. Stagger workflow execution
```

#### **Storage Issues**
```
Problem: Download failures atau storage full
Solution:
1. Clean up old files manually
2. Adjust retention policy
3. Check GitHub repository limits
4. Implement compression
```

### Debug Mode Activation
```json
// Add to any config file
{
  "debug_mode": {
    "enabled": true,
    "verbose_logging": true,
    "screenshot_errors": true,
    "network_monitoring": true
  }
}
```

---

## 📞 Support & Resources

### Official Resources
- **🎫 License Store**: [Bot Automation Official](http://lynk.id/botxautomation/34kvz08g6oz1)
- **📧 Email Support**: Use your license email for support requests
- **🐛 Bug Reports**: GitHub Issues (private repo only)
- **📖 Documentation**: This README + inline code comments

### Community Guidelines
- **Responsible Usage**: Use for educational and legitimate marketing only  
- **Ethical Scraping**: Respect content creators and original sources
- **Platform Compliance**: Stay updated with Facebook policy changes
- **Knowledge Sharing**: Help improve the bot through feedback

---

## 🔄 Changelog & Updates

### Version 2.0 (Latest)
- ✅ **NEW**: Auto Scrape Reels functionality
- ✅ **NEW**: Auto Update Status dengan scheduling
- ✅ **NEW**: Auto Share Reels dengan cross-posting
- ✅ **ENHANCED**: AI-powered comment generation dengan Gemini
- ✅ **ENHANCED**: Multi API key fallback system  
- ✅ **ENHANCED**: Advanced anti-duplicate mechanisms
- ✅ **ENHANCED**: Comprehensive error handling dan retry logic
- ✅ **ENHANCED**: Better rate limiting compliance
- ✅ **ENHANCED**: Storage management dan cleanup automation
- ✅ **ENHANCED**: Workflow orchestration dan scheduling

### Upcoming Features (Roadmap)
- 🔮 **Stories Automation**: Auto upload stories dengan scheduling
- 🔮 **Live Stream Integration**: Auto notification dan interaction
- 🔮 **Advanced Analytics**: Detailed performance dashboard
- 🔮 **Multi-Platform**: Instagram dan TikTok integration
- 🔮 **Team Management**: Multi-user collaboration features

---

## 🎯 Use Cases & Applications

### Digital Marketing
- **Content Distribution**: Efisien sharing ke multiple grup dan timeline
- **Engagement Boost**: Otomatis interaction untuk meningkatkan visibility
- **Lead Generation**: Smart commenting dengan CTA integration
- **Brand Awareness**: Consistent presence melalui automated posting

### Content Creation
- **Content Curation**: Smart reels scraping dari competitor atau inspiration
- **Repurposing**: Otomatis share konten dengan modification
- **Scheduling**: Consistent posting tanpa manual intervention  
- **Cross-Platform**: Distribute content across multiple Facebook assets

### Community Management
- **Group Activity**: Maintain active presence di target communities
- **Member Engagement**: Respond dan interact dengan group members
- **Content Moderation**: Monitor dan manage community content
- **Growth Hacking**: Leverage automation untuk organic growth

---

**⚡ Kesimpulan**: FB Auto Tools adalah complete automation suite yang menggabungkan power dari AI, cloud computing, dan advanced web automation untuk memberikan solusi comprehensive Facebook marketing. Gunakan secara bijak dan bertanggung jawab untuk hasil optimal!

**🔒 Remember**: Always comply with platform policies dan use for legitimate business purposes only.
