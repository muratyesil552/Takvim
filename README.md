# 🗓️ Öğrenci Takvimi

Laptopta geliştirilen, Android telefona **uygulama olarak kurulan** (PWA) öğrenci dönem planlayıcısı.
Kurulduktan sonra internetsiz çalışır; veriler telefonun içinde saklanır.

## Paneller
| Sekme | Ne gösterir |
|---|---|
| ☀️ **Bugün** (Panel 1) | Günün dersleri + saatleri + bu haftanın ders kutucuğu, bugün yapılacaklar; altında **haftalık**, en altta **aylık/dönemlik** planlar |
| 🗂️ **Hafta** (Panel 2) | Haftalık ders programı (Pzt–Paz), haftanın ders takibi kutucukları, günlük / haftalık / uzun işler |
| 📅 **Ay** (Panel 4) | Ay takvimi; her günün altında o günün işleri. Güne dokun → o günün planı |
| 🎓 **Dönem** (Panel 3) | Ders × hafta gidişat tablosu (kaçıncı haftadasın, hangi dersi hallettin), sınav tarihleri, ödev/projeler |
| 🔔 **Unutma** | Görev olmayan gündelik hatırlatmalar (fatura yatır, öğrenci kartını yenile vb.) — **yanıp söner** ve Bugün ekranının en üstünde yapışkan not olarak durur |

**Otomatik yerleşim:** Bir görevi tek bir kez başlangıç–bitiş tarihiyle girersin; o aralığa denk gelen her panelde kendiliğinden görünür.
1 gün → günlük · 2–7 gün → haftalık · 7 günden uzun → aylık/dönemlik.

Görev türleri: 📝 Sınav/Quiz · 📚 Ödev/Proje · 🎉 Arkadaş etkinliği · 🎯 Bireysel çalışma.

## Laptopta denemek
```powershell
py -m http.server 8000
```
Tarayıcıda http://localhost:8000 adresini aç. (Örnek verilerle görmek için: http://localhost:8000/?demo — sadece hiç veri yokken çalışır.)

## Telefona kurmak (Android)
Uygulamanın bir **https** adresinde yayınlanması gerekiyor. En kolay yol GitHub Pages (ücretsiz):
1. GitHub'da yeni bir repo aç (ör. `ogrenci-takvim`) ve bu klasördeki dosyaları yükle.
2. Repo → **Settings → Pages** → Branch: `main` / root → Save.
3. Telefonda Chrome ile `https://KULLANICIADIN.github.io/ogrenci-takvim/` adresini aç.
4. Chrome menüsü (⋮) → **Uygulamayı yükle / Ana ekrana ekle**. Artık normal bir uygulama gibi açılır.

### APK istersen
Yayındaki adresi https://www.pwabuilder.com sitesine yapıştır → **Android** → APK paketini indir → telefona kur.
Bilgisayara Android SDK kurman gerekmez.

## Yedekleme
⚙️ Ayarlar → **Yedeği indir / Yedek yükle** (JSON). Telefon değiştirirken veya tarayıcı verisini silmeden önce yedek al.

## Dosyalar
- `index.html` – iskelet · `styles.css` – açık, ferah tema · `app.js` – tüm mantık
- `manifest.webmanifest`, `sw.js`, `icons/` – telefona kurulum ve çevrimdışı çalışma
