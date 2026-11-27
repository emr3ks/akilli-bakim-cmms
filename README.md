# Meknivo CMMS

Endüstriyel tesisler için makine envanteri, QR kodla makine erişimi, periyodik bakım planlama, bakım/arıza kayıtları ve rol bazlı çalışma akışları sunan mobil öncelikli CMMS uygulaması.

Faz 1–5 kapsamında Expo tabanlı iOS/Android/Web arayüzü, Express REST API, kalıcı SQLite veritabanı, bakım analitiği ve otomatik backend testleri bulunur.

## Özellikler

- **Rol bazlı giriş:** Bakım Yöneticisi, Bakım Teknisyeni ve Operatör rolleri için hazır demo hesapları.
- **Özet dashboard:** Toplam, çalışan, bakımda, arızalı ve duruşta makine sayıları.
- **Makine envanteri:** Makine kodu, ad, üretim hattı/bölge, marka-model, seri numarası, kritik seviye ve anlık durum alanlarıyla CRUD işlemleri.
- **Arama ve filtreleme:** Makine kodu/adı, hat, durum ve kritik seviyeye göre anlık filtreleme.
- **QR yönetimi:** Her makine için benzersiz QR içeriği, ekranda QR görüntüleme ve yazdırılabilir makine kimlik kartı.
- **QR okutma:** Kamera ile okutma, makine kodu ile manuel arama ve masaüstü/simülasyon seçici.
- **Bakım ve arıza kayıtları:** Rol yetkilerine göre bakım planı ve arıza bildirimi; yeni arıza makine durumunu günceller.
- **Fotoğraflı hızlı arıza bildirimi:** Makine kartından veya QR ile bulunan makineden başlık, kategori, aciliyet, açıklama ve fotoğrafla `ARZ-YYYY-NNN` kaydı oluşturur.
- **İş emri yönetimi:** Bakım yöneticisi arızayı `IE-YYYY-NNN` iş emrine dönüştürür, teknisyene atar; teknisyen durum akışını ve çözüm kanıtını yönetir.
- **Rol kapsamlı yönetim:** Yönetici tüm kayıtları görür, teknisyen yalnızca kendi iş emirlerini, operatör yalnızca kendi arıza bildirimlerini görür.
- **Arıza ve iş emri filtreleme:** Açık durum, aciliyet ve atanan teknisyene göre anlık filtreleme.
- **Faz 2 dashboard sayaçları:** Açık arıza ve aktif iş emri sayıları ana özet panelinde gösterilir.
- **Periyodik bakım planları:** Makine bazlı `PB-YYYY-NNN` planları; haftalık, aylık, 3 aylık, 6 aylık, yıllık ve çalışma saati bazlı periyotları destekler.
- **Çalışma saati takibi:** Teknisyen güncel makine saatini raporlar; eşik, gecikme ve yaklaşma durumu okuma değerinden hesaplanır.
- **Bakım takvimi:** Geciken, bugünkü, yaklaşan ve ileri tarihli planları metin ve renk etiketleriyle ayırır.
- **Kontrol listesi icrası:** Teknisyen her kontrol maddesini işaretler, ölçüm/not girer; tüm maddeler tamamlandığında sonraki bakım tarihi otomatik hesaplanır.
- **Bakım geçmişi:** Tamamlanan kontrol sonuçları, ölçümler, notlar ve yeni tarih plan bazında kayıt altına alınır.
- **Faz 3 dashboard sayaçları:** Yaklaşan, bugünkü ve geciken periyodik bakım sayıları ana özet panelinde gösterilir.
- **Yedek parça kataloğu:** `YDK-YYYY-NNN` kodlu parçalarda kategori, uyumlu makine, birim, mevcut/minimum stok, konum ve birim maliyet alanlarıyla CRUD, arama ve filtreleme.
- **Stok kontrollü parça kullanımı:** Açık iş emri veya periyodik bakım planına parça eklenirken stoktan otomatik düşüm, miktar düzeltme ve silmede otomatik iade uygulanır.
- **İş emri parça maliyeti:** Kullanılan parçaların miktar ve birim maliyetleri iş emri toplamında izlenir.
- **Stok hareket defteri:** Stok girişi, iş emri kullanımı ve iade hareketleri tarih, miktar, kullanıcı ve kayıt bağlantısıyla saklanır.
- **Kritik stok uyarıları:** Kritik seviye ve tükenen parçalar ayrı uyarı görünümünde vurgulanır; dashboard kritik parça sayısını gösterir.
- **Meknivo marka kimliği:** Resmi SVG varlıkları giriş, üst navigasyon, yükleme ekranı, makine kartı ve yazdırılabilir QR kimlik kartında kullanılır.
- **Demo verileri:** Gerçekçi endüstriyel makineler, 3 farklı rolde kullanıcı, farklı aşamalarda arıza/iş emri, altı periyodik bakım planı, sekiz yedek parça ve örnek stok hareketleri.
- **Faz 5 bakım analitiği:** Bakım yöneticisi için MTBF, MTTR, toplam müdahale süresi, iş emri/periyodik bakım yedek parça maliyetleri, en çok arıza veren ilk 5 makine ve beş kanonik arıza kategorisinin dağılımı.
- **Makine bakım sicil kartı:** Makine detayındaki **Makine Bakım Geçmişi** sekmesi; arızalar, iş emirleri, periyodik bakım tamamlamaları, eski bakım kayıtları ve parça kullanım/iade hareketlerini kronolojik gösterir.
- **Meknivo logolu teknik servis formu:** Tamamlanan iş emirleri ve periyodik bakım kayıtları için makine künyesi, kök neden, kontrol sonuçları, parça maliyeti, teknisyen/bakım yöneticisi imza alanları ve A4 yazdırma düzeni içeren PDF.
- **Expo Go uyumluluğu:** Fiziksel cihazda LAN IP'den API adresi çözümleme, eyleme dönük ağ hataları, Hermes uyumlu tarih/sayı biçimleme, QR üretim fallback'i ve bölüm bazlı veri yükleme hata yönetimi.

## Teknoloji

- Expo / React Native / React Native Web
- TypeScript
- Node.js / Express REST API
- SQLite (`sqlite3`)
- Vitest + Supertest
- Expo Camera, Expo Image Picker, Expo Print, Expo Sharing, Expo Constants ve React Native QR Code SVG

## Gereksinimler

- Node.js `22.13+` (Expo SDK 58; Node.js `24.3+` veya `26+` de desteklenir)
- npm `10+`
- Web geliştirmesi için güncel bir tarayıcı
- QR kodunu fiziksel olarak okumak için iOS/Android cihazda kamera izni

## Kurulum

### 1. Kaynakları ve bağımlılıkları hazırlayın

```bash
git clone https://github.com/emr3ks/akilli-bakim-cmms.git
cd akilli-bakim-cmms
npm install
```

### 2. Demo veritabanını hazırlayın

```bash
npm run demo
```

Bu komut demo kullanıcılarını, endüstriyel makineleri, geçmiş arıza/iş emirlerini, periyodik bakım tamamlamalarını, yedek parçaları ve stok hareketlerini yerel SQLite veritabanına deterministik olarak yeniden yükler.

### 3. API sunucusunu başlatın

```bash
npm run server
```

API varsayılan olarak `http://localhost:3006/api` adresinde çalışır. Sağlık kontrolü:

```bash
curl http://localhost:3006/api/health
```

### 4A. Web kurulumu

Yeni bir terminalde:

```bash
npm run web
```

Expo terminalindeki bağlantıyı kullanarak uygulamayı tarayıcıda açın. Web'de API adresi varsayılan olarak `http://localhost:3006/api` kullanılır.

### 4B. iOS / Android Expo Go kurulumu

1. Telefon ve bilgisayarı aynı Wi-Fi ağına bağlayın.
2. Bilgisayarın LAN IP adresini öğrenin (`ipconfig` veya `ip addr`).
3. Proje kökünde `.env.local` oluşturun:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.25:3006/api
EXPO_PUBLIC_API_PORT=3006
```

4. Expo Go'yu telefonda açın ve QR kodunu okutarak projeye bağlanın:

```bash
npm start
```

5. Metro ile fiziksel cihaz bağlantısında ağ adresi bulunabiliyorsa uygulama bu adresi API için de kullanır. Tünel, özel ağ veya firewall nedeniyle otomatik adres çözülemiyorsa `.env.local` değerini **bilgisayarın LAN IP adresiyle** açıkça verin.

> Fiziksel telefonda `localhost` telefonu kendisini, `127.0.0.1` de cihazın yerel döngüsünü gösterir; bilgisayardaki API sunucusuna ulaşmaz. `.env.local` değişikliğinden sonra Metro'yu durdurup `npm start -- --clear` ile yeniden başlatın.

Expo Go kontrol listesi: yönetici girişi, makine detayı ve bakım geçmişi sekmesi, arıza/iş emri listesi, periyodik bakım geçmişi, yedek parça kataloğu, kapalı iş emri servis formu ve periyodik bakım servis formu.

## Demo girişleri

Giriş ekranındaki **Hızlı Demo Giriş** düğmeleri ilgili rolle doğrudan oturum açar.

| Rol | Kullanıcı | Yetki özeti |
| --- | --- | --- |
| Bakım Yöneticisi | Adın Yönetici | Makine CRUD, QR, periyodik plan, yedek parça CRUD/stok girişi, bakım/arıza, dashboard, **Analitik KPI ekranı** ve tüm servis formları |
| Bakım Teknisyeni | Deniz Teknisyen | Makine görüntüleme, QR okutma, atanan plan/iş emirlerinde parça kullanımı, bakım/arıza kaydı ve kendi servis formları |
| Operatör | Elif Operatör | Makine görüntüleme, QR okutma, hızlı arıza bildirimi |

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run web` | Expo Web geliştirme sunucusunu başlatır |
| `npm start` | Expo mobil geliştirme sunucusunu başlatır |
| `npm run server` | Express API sunucusunu başlatır |
| `npm run demo` | Demo verilerini sıfırlayıp yükler |
| `npm test` | Backend iş kuralları ve API testlerini çalıştırır |
| `npm run lint` | TypeScript/React ve backend kaynaklarında lint kontrolü yapar |
| `npm run typecheck` | Strict TypeScript kontrolünü hatasız çalıştırır |
| `npm run build` | Expo Web üretim çıktısını `dist/` klasörüne üretir |
| `npm run capture:ui` | API ve Expo sunucuları çalışırken gerçek tarayıcı akışlarını doğrular ve ekran görüntülerini kaydeder |
| `npm run capture:phase4` | Çalışan Faz 4 API/Expo uygulamasından yedek parça, uyarı ve parça kullanımı ekran kanıtlarını kaydeder |
| `npm run capture:phase5` | Çalışan API/Expo uygulamasından analitik, servis formu ve makine bakım geçmişi ekran kanıtlarını kaydeder |
| `npx expo-doctor` | Expo SDK ve paket uyumluluğunu denetler |
| `npx expo install --check` | Expo SDK'nın beklediği paket sürümlerini doğrular |
| `npm run brand:generate` | Resmi `assets/brand/` SVG dosyalarından uygulama içi marka kaynağını yeniler |
| `npm run check` | Lint, typecheck, test ve üretim derlemesini birlikte çalıştırır |

## API özeti

Tüm makine yazma işlemleri `x-user-id` başlığındaki kullanıcı kimliği ile yetkilendirilir.

| Metot | Uç nokta | Yetki |
| --- | --- | --- |
| `GET` | `/api/health` | Herkese açık |
| `GET` | `/api/auth/demo-users` | Herkese açık |
| `POST` | `/api/auth/login` | Herkese açık |
| `GET` | `/api/dashboard/summary` | Oturum açmış kullanıcı; açık arıza, aktif iş emri, periyodik bakım ve kritik stok parçası sayaçlarını destekler |
| `GET` | `/api/analytics/maintenance` | Bakım yöneticisi; MTBF, MTTR, müdahale süresi, yedek parça maliyeti, Top 5 arıza makinesi ve kategori dağılımı |
| `GET` | `/api/spare-parts` | Oturum açmış kullanıcı; `q`, `code`, `name`, `category`, `status` filtreleriyle yedek parça kataloğu |
| `GET/POST` | `/api/spare-parts` | Okuma: herkese açık oturum; yazma: yönetici |
| `GET/PUT/DELETE` | `/api/spare-parts/:id` | Okuma: herkese açık oturum; güncelleme/silme: yönetici |
| `POST` | `/api/spare-parts/:id/stock-movements` | Yönetici; satın alma/stok girişi ve hareket kaydı |
| `GET` | `/api/stock-alerts` | Oturum açmış kullanıcı; kritik ve tükenen parçalar |
| `GET` | `/api/stock-movements` | Oturum açmış kullanıcı; tarih, miktar ve kullanıcı bilgili stok hareket defteri |
| `GET/POST/PUT/DELETE` | `/api/work-orders/:id/parts` | Yönetici veya atanmış teknisyen; açık iş emrinde parça kullanımı, stok düşümü/iadesi ve maliyet |
| `GET/POST/PUT/DELETE` | `/api/preventive-plans/:id/parts` | Yönetici veya atanmış teknisyen; periyodik bakımda parça kullanımı ve stok düşümü/iadesi |
| `GET` | `/api/preventive-plans` | Yönetici tüm planları, teknisyen yalnızca kendi atamalarını görür; `machineId` ve `assignedTo` filtrelerini destekler |
| `GET` | `/api/preventive-plans/:id` | Yönetici veya planın atanmış teknisyeni |
| `POST` | `/api/preventive-plans` | Yönetici; makine, periyot, teknisyen ve kontrol listesiyle `PB-YYYY-NNN` planı oluşturur |
| `POST` | `/api/preventive-plans/:id/runtime` | Atanmış teknisyen/yönetici; çalışma saati planının güncel makine saatini raporlar |
| `POST` | `/api/preventive-plans/:id/complete` | Atanmış teknisyen/yönetici; kontrol sonuçlarını kaydeder ve sonraki bakım tarihini ilerletir |
| `GET` | `/api/preventive-plans/:id/completions` | Yönetici veya planın atanmış teknisyeni; tamamlanan bakım geçmişi |
| `GET` | `/api/preventive-plans/:id/completions/:executionId/service-report` | Yönetici veya planın atanmış teknisyeni; periyodik bakım servis formu verisi |
| `GET` | `/api/faults` | Rol kapsamlı: yönetici tümü, teknisyen ilgili kayıtlar, operatör kendi bildirimleri; `status`, `urgency`, `assignedTo` ve `machineId` filtrelerini destekler |
| `GET` | `/api/faults/:id` | Görüntülenebilen arıza kaydı |
| `POST` | `/api/faults` | Tüm roller; fotoğraflı arıza bildirimi oluşturur |
| `POST` | `/api/machines/:id/faults` | Tüm roller; makine bağlı fotoğraflı arıza bildirimi oluşturur |
| `GET` | `/api/work-orders` | Yönetici tümü, teknisyen yalnızca kendi atamaları; durum, aciliyet, teknisyen ve makime göre filtreler |
| `GET` | `/api/work-orders/:id` | Yönetici veya atanmış teknisyen |
| `GET` | `/api/work-orders/:id/service-report` | Yönetici veya atanmış teknisyen; tamamlanan iş emri için teknik servis formu verisi |
| `POST` | `/api/work-orders` | Yönetici; arızadan iş emri oluşturur ve teknisyene atayabilir |
| `POST` | `/api/work-orders/:id/assign` | Yönetici; açık iş emrine teknisyen atar |
| `PATCH` | `/api/work-orders/:id/status` | Atanmış teknisyen/yönetici; durum geçişi ve çözüm kanıtı |
| `GET` | `/api/machines` | Oturum açmış kullanıcı; `q`, `line`, `status`, `criticality` filtrelerini destekler |
| `GET` | `/api/machines/:id` | Oturum açmış kullanıcı |
| `GET` | `/api/machines/:id/maintenance-history` | Yönetici veya teknisyen; rol atamalarına göre kronolojik arıza, iş emri, periyodik bakım, parça ve eski kayıt geçmişi |
| `GET` | `/api/machines/code/:code` | Oturum açmış kullanıcı |
| `POST` | `/api/machines` | Yönetici |
| `PUT` | `/api/machines/:id` | Yönetici |
| `DELETE` | `/api/machines/:id` | Yönetici |
| `GET/POST` | `/api/machines/:id/maintenance-records` | Okuma: herkese açık; yazma: yönetici/teknisyen |
| `GET/POST` | `/api/machines/:id/fault-records` | Okuma: herkese açık; yazma: tüm roller |

Fotoğraflar `photoBase64` + `photoMimeType` (arıza) ve `solutionPhotoBase64` + `solutionPhotoMimeType` (çözüm) alanlarıyla gönderilir. API JPEG, PNG ve WebP imaj magic byte'larını ve en fazla 2 MB çözülmüş boyutu doğrular.

Periyodik bakım tarihleri `Europe/Istanbul` tesis saat diliminde hesaplanır. Çalışma saati planlarının durumu son raporlanan makine saati ile eşik değerden hesaplanır; eşiğe eşitken “günü gelen”, eşik aşıldığında “geciken” durumuna geçer. Okuma değerleri geriye gidemez.

Bakım tamamlama isteği `occurrenceKey` ile gönderilir. Aynı anahtarla yapılan tekrar denemesi yeni geçmiş kaydı oluşturmaz ve ilk tamamlamanın sonucunu döndürür.

Faz 5 metotları: **MTBF**, aynı makinedeki kronolojik kanonik arıza bildirimleri arasındaki sürelerin ortalamasıdır (çalışma saati tabanlı gerçek MTBF değildir; en az iki arıza gerekir). **MTTR**, yalnızca süresi kayıtlı kapatılmış iş emirlerinin müdahale sürelerinin ortalamasıdır. **Maliyet**, iade edilmemiş yedek parça kullanımlarının kullanım anındaki `miktar × birim maliyet` toplamıdır; işçilik maliyeti bu modelde yer almaz. Periyodik bakım parçaları plan seviyesine bağlıdır, tek bir tamamlama anına bağlı değildir.

Hatalar `{ "error": { "message": "...", "code": "..." } }` biçiminde döner. Yetkisiz istekler `401`, yetki dışı istekler `403`, doğrulama hataları `400` durum koduyla sonuçlanır.

## Veritabanı ve yapılandırma

Varsayılan SQLite dosyası `server/data/cmms.sqlite` konumundadır. Alternatif veritabanı yolu için `CMMS_DB_PATH`, API portu için `CMMS_PORT` tanımlanabilir. `.env.example` dosyası örnek değerleri içerir.

## Görsel doğrulama

Gerçek Expo Web uygulaması Edge üzerinde `390×844` mobil ve `1440×900` masaüstü görünümlerinde çalıştırılarak doğrulandı. Faz 5 için `2a32513` baseline sürümündeki dashboard, iş emri ve makine detayı ekranları değişiklik sonrası aynı senaryolarla karşılaştırıldı; analitik KPI ve makine bakım geçmişi ekranları yalnızca değişiklik sonrası sürümde bulunmaktadır. Faz 4 için `bb52dd0` baseline sürümündeki dashboard ve iş emri ekranları ile değişiklik sonrası aynı senaryolar karşılaştırıldı; yeni yedek parça, uyarı ve parça kullanımı ekranlarının çıktıları `docs/screenshots/` klasöründe kayıtlıdır:

- [Öncesi mobil dashboard](docs/screenshots/before-phase5-mobile-dashboard.png) / [Sonrası mobil dashboard](docs/screenshots/after-phase5-mobile-dashboard.png)
- [Öncesi mobil iş emirleri](docs/screenshots/before-phase5-mobile-work-orders.png) / [Sonrası mobil iş emirleri](docs/screenshots/after-phase5-mobile-work-orders.png)
- [Öncesi mobil makine detayı](docs/screenshots/before-phase5-mobile-machine-detail.png) / [Sonrası mobil makine detayı](docs/screenshots/after-phase5-mobile-machine-detail.png)
- [Öncesi masaüstü dashboard](docs/screenshots/before-phase5-desktop-dashboard.png) / [Sonrası masaüstü dashboard](docs/screenshots/after-phase5-desktop-dashboard.png)
- [Öncesi masaüstü iş emirleri](docs/screenshots/before-phase5-desktop-work-orders.png) / [Sonrası masaüstü iş emirleri](docs/screenshots/after-phase5-desktop-work-orders.png)
- [Öncesi masaüstü makine detayı](docs/screenshots/before-phase5-desktop-machine-detail.png) / [Sonrası masaüstü makine detayı](docs/screenshots/after-phase5-desktop-machine-detail.png)
- [Faz 5 mobil makine bakım geçmişi](docs/screenshots/after-phase5-mobile-machine-history.png)
- [Faz 5 mobil bakım analitiği](docs/screenshots/after-phase5-mobile-analytics.png)
- [Faz 5 masaüstü makine bakım geçmişi](docs/screenshots/after-phase5-desktop-machine-history.png)
- [Faz 5 masaüstü bakım analitiği](docs/screenshots/after-phase5-desktop-analytics.png)

- [Öncesi mobil dashboard](docs/screenshots/before-phase4-mobile-dashboard.png) / [Sonrası mobil dashboard](docs/screenshots/after-phase4-mobile-dashboard.png)
- [Öncesi masaüstü dashboard](docs/screenshots/before-phase4-desktop-dashboard.png) / [Sonrası masaüstü dashboard](docs/screenshots/after-phase4-desktop-dashboard.png)
- [Öncesi mobil iş emirleri](docs/screenshots/before-phase4-mobile-work-orders.png) / [Sonrası mobil iş emirleri](docs/screenshots/after-phase4-mobile-work-orders.png)
- [Öncesi masaüstü iş emirleri](docs/screenshots/before-phase4-desktop-work-orders.png) / [Sonrası masaüstü iş emirleri](docs/screenshots/after-phase4-desktop-work-orders.png)
- [Faz 4 mobil yedek parça kataloğu](docs/screenshots/after-phase4-mobile-spare-parts.png)
- [Faz 4 mobil kritik stok uyarıları](docs/screenshots/after-phase4-mobile-stock-alerts.png)
- [Faz 4 mobil parça kullanımı](docs/screenshots/after-phase4-mobile-part-usage.png)
- [Faz 4 masaüstü yedek parça kataloğu](docs/screenshots/after-phase4-desktop-spare-parts.png)

- [Öncesi mobil dashboard](docs/screenshots/before-mobile-dashboard.png) / [Sonrası mobil dashboard](docs/screenshots/after-mobile-dashboard.png)
- [Öncesi Faz 3 mobil giriş](docs/screenshots/before-phase3-mobile-login.png) / [Sonrası Faz 3 mobil giriş](docs/screenshots/after-phase3-mobile-login.png)
- [Öncesi Faz 3 mobil dashboard](docs/screenshots/before-phase3-mobile-dashboard.png) / [Sonrası Faz 3 mobil dashboard](docs/screenshots/after-phase3-mobile-dashboard.png)
- [Öncesi Faz 3 masaüstü dashboard](docs/screenshots/before-phase3-desktop-dashboard.png) / [Sonrası Faz 3 masaüstü dashboard](docs/screenshots/after-phase3-desktop-dashboard.png)
- [Öncesi Faz 3 mobil makine kartı](docs/screenshots/before-phase3-mobile-machine-detail.png) / [Sonrası Faz 3 mobil makine kartı](docs/screenshots/after-phase3-mobile-machine-detail.png)
- [Faz 3 mobil periyodik bakım planları](docs/screenshots/after-phase3-mobile-preventive-plans.png)
- [Faz 3 mobil yeni plan formu](docs/screenshots/after-phase3-mobile-preventive-create.png)
- [Faz 3 mobil kontrol listesi icrası](docs/screenshots/after-phase3-mobile-preventive-checklist.png)
- [Faz 3 mobil çalışma saati güncelleme](docs/screenshots/after-phase3-mobile-preventive-runtime.png)
- [Faz 3 masaüstü periyodik bakım planları](docs/screenshots/after-phase3-desktop-preventive-plans.png)
- [Öncesi mobil makine kartı](docs/screenshots/before-mobile-machine-detail.png) / [Sonrası mobil makine kartı](docs/screenshots/after-mobile-machine-detail.png)
- [Öncesi masaüstü dashboard](docs/screenshots/before-desktop-dashboard.png) / [Sonrası masaüstü dashboard](docs/screenshots/after-desktop-dashboard.png)
- [Mobil iş emri yönetim ekranı](docs/screenshots/after-mobile-work-orders.png)
- [Mobil fotoğraflı arıza bildirimi ve önizleme](docs/screenshots/after-mobile-fault-report.png)
- [Gönderilen arıza doğrulaması](docs/screenshots/after-mobile-fault-reported.png)
- [Makine detayındaki Faz 2 arıza geçmişi](docs/screenshots/after-mobile-fault-history.png)
- [Teknisyen iş emri kapatma akışı](docs/screenshots/after-mobile-work-order-closure.png)
- [Masaüstü iş emri yönetim ekranı](docs/screenshots/after-desktop-work-orders.png)
- [Mobil giriş](docs/screenshots/after-mobile-login.png)
- [Mobil envanter](docs/screenshots/after-mobile-inventory.png)
- [Mobil QR okutma](docs/screenshots/after-mobile-scanner.png)

`npm run capture:ui` komutu bu akışları yeniden çalıştırır; API ve Expo sunucularının çalışıyor olması gerekir. Betik, gerçek bir PNG dosyası seçip arıza bildirimini gönderir; teknisyen iş emrini müdahale/parça/çözüldü/kapatıldı durumları boyunca ilerletir; yeni periyodik plan formunu ve kontrol listesi icra ekranını doğrular; yatay taşma ile tarayıcı hatalarını denetler. `npm run capture:phase5` aynı Edge akışında dashboard, iş emri, makine detayı/geçmişi ve yönetim analitiği ekranlarını `before`/`after` etiketiyle kaydeder.

## Proje yapısı

```text
.
├── App.tsx                 # Expo uygulama girişi
├── src/                    # Ekranlar, bileşenler, tema ve API istemcisi
├── server/
│   ├── scripts/            # Demo veri yükleme
│   ├── src/                # Express uygulaması, veritabanı ve servisler
│   └── test/               # Vitest + Supertest API testleri
├── app.json                # Expo platform yapılandırması
└── package.json
```

## Sorun giderme

- **API'ye bağlanılamıyor / fiziksel telefonda hata:** `npm run server` çalışıyor ve Windows Firewall port `3006`'ya izin veriyor mu? Telefonda `EXPO_PUBLIC_API_URL` bilgisayarın **LAN IP adresini** içeriyor mu? Değişiklikten sonra Metro'yu `npm start -- --clear` ile yeniden başlattınız mı?
- **Boş envanter:** `npm run demo` komutunu çalıştırın.
- **Kamera bulunamadı:** Web'de kamera HTTPS veya `localhost` gerektirebilir. Manuel kod girişi veya demo makine seçicisini kullanabilirsiniz.
- **Native modül hatası:** `npm install` sonrasında Expo Go'yu yeniden başlatın; geliştirme build'i gerektiren paketler için `npx expo run:ios` veya `npx expo run:android` kullanın.
