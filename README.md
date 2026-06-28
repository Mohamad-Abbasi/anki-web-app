# AnkiWeb — اپ وب تکرار فاصله‌دار (سازگار با Anki)

یک کلون سبک و موبایل‌محور از AnkiWeb که کاملاً در مرورگر اجرا می‌شود.
هیچ سروری لازم نیست؛ همه‌ی داده‌ها به‌صورت محلی در **IndexedDB** ذخیره می‌شوند.
مخصوص استفاده‌ی راحت روی **iPhone** (قابل نصب روی صفحه‌ی اصلی به‌صورت PWA) طراحی شده.

## امکانات

- 📥 **ورود فایل‌های `.apkg`** ساخته‌شده در Anki/AnkiWeb (نوت‌ها، کارت‌ها، مدل‌ها و مدیا).
- 🧠 **زمان‌بندی FSRS** (همان موتور AnkiWeb جدید) و گزینه‌ی کلاسیک **SM-2**.
- ⏱️ **مراحل یادگیری دقیقه‌ای** مثل Anki (مثلاً ۱ و ۱۰ دقیقه) با چهار دکمه‌ی «دوباره/سخت/خوب/آسان».
- 📝 پشتیبانی از نوت‌های **Basic**، **Basic & reversed** و **Cloze** + رندر کامل قالب‌ها (`{{Field}}`، شرط‌ها، `{{cloze:...}}`).
- 🖼️ نمایش **تصویر و صوت** کارت‌ها (مدیای داخل apkg).
- 📤 **خروجی** هر دک به فایل `.apkg` سازگار با Anki.
- 📊 صفحه‌ی **آمار** (مرور روزانه، دقت، ترکیب کارت‌ها).
- 🔎 **مرورگر کارت‌ها** برای افزودن/ویرایش/حذف.
- 📱 **PWA** با کارکرد آفلاین؛ روی آیفون از Safari → Share → «Add to Home Screen».

## اجرای محلی

```bash
npm install
npm run dev
```

سپس آدرس چاپ‌شده را در مرورگر باز کن.

## ساخت نسخه‌ی تولید

```bash
npm run build
npm run preview
```

## انتشار روی GitHub Pages

1. مخزن را روی GitHub بساز و کد را push کن (شاخه‌ی `main`).
2. در **Settings → Pages**، گزینه‌ی **Build and deployment → Source** را روی **GitHub Actions** بگذار.
3. هر push به `main` به‌صورت خودکار با ورک‌فلوی [deploy.yml](.github/workflows/deploy.yml) ساخته و منتشر می‌شود.

مسیر `base` در [vite.config.js](vite.config.js) روی `./` است و مسیریابی از `HashRouter`
استفاده می‌کند، بنابراین برنامه زیر هر زیرمسیری (مثل `username.github.io/anki-web-app/`) درست کار می‌کند.

## نکته درباره‌ی فایل‌های apkg جدید

اگر apkg با فشرده‌سازی جدید Anki (`collection.anki21b`/zstd) ساخته شده باشد،
هنگام Export در Anki دسکتاپ گزینه‌ی **«Support older Anki versions»** را فعال کن
تا فایل با طرح‌واره‌ی SQLite قابل‌خواندن خروجی گرفته شود.

## معماری

| لایه | مسیر |
|------|------|
| پایگاه‌داده (Dexie/IndexedDB) | [src/lib/database](src/lib/database) |
| الگوریتم‌ها (FSRS / SM-2) | [src/lib/algorithms](src/lib/algorithms) |
| زمان‌بند یکپارچه | [src/lib/scheduler/scheduler.js](src/lib/scheduler/scheduler.js) |
| ورود/خروج apkg | [src/lib/apkg](src/lib/apkg) |
| رندر قالب و مدیا | [src/lib/render](src/lib/render) |
| رابط کاربری | [src/components](src/components) و [src/pages](src/pages) |
