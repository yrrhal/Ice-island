# جزيرة الجليد — Ice Island

لعبة فيزيائية عربية لفرز الكرات، مبنية بـ HTML/CSS/JS ومحرك الفيزياء
Matter.js، مُهيّأة كمشروع [Capacitor](https://capacitorjs.com) قابل
للبناء كتطبيق أندرويد ونشره على Google Play.

## بنية المشروع

```
ice-island/
├── www/                    ← كود اللعبة الفعلي (هذا ما يُعرض داخل التطبيق)
│   ├── index.html
│   ├── manifest.json
│   ├── css/style.css
│   ├── js/
│   │   ├── game.js         محرك اللعبة الأساسي (فيزياء، اقتصاد، مراحل)
│   │   ├── ui.js            نظام النوافذ المخصص
│   │   ├── effects.js       التأثيرات البصرية والحركية
│   │   └── iap.js           نظام الشراء داخل التطبيق
│   └── assets/
│       ├── sounds/          (تحتاج تنزيل الملفات — راجع README بداخله)
│       ├── libs/             (يحتاج matter.min.js — راجع README بداخله)
│       └── icons/            (يحتاج أيقونتين — راجع README بداخله)
├── docs/
│   ├── PUBLISHING_CHECKLIST.md   ← ابدأ من هنا
│   ├── IAP_SETUP.md
│   ├── PRIVACY_POLICY.md
│   └── STORE_LISTING.md
├── .github/workflows/build-android.yml   ← بناء تلقائي عند كل رفع
├── package.json
└── capacitor.config.json
```

## البدء السريع (على جهازك، حيث يتوفر إنترنت و Node.js)

```bash
npm install
npx cap add android
npx cap sync android
npx cap open android   # يفتح المشروع في Android Studio
```

من Android Studio: Build → Generate Signed Bundle/APK.

## البناء التلقائي عبر GitHub Actions

بعد رفع هذا المستودع (بما فيه مجلد `android/` الذي ينشئه أمر
`cap add android` أعلاه)، كل push على الفرع الرئيسي يُشغّل بناءً تلقائيًا
عبر GitHub Actions (`.github/workflows/build-android.yml`) وينتج ملف
APK قابل للتنزيل من تبويب Actions في مستودعك — دون الحاجة لأي إعداد محلي
لتجربة البناء.

## قبل النشر الفعلي

اقرأ `docs/PUBLISHING_CHECKLIST.md` بالكامل — يحتوي كل خطوة متبقية
(الأصوات، الأيقونات، الفوترة الحقيقية، التوقيع، بطاقة العرض) بالترتيب.

## ما تغيّر عن النسخة الأصلية

راجع سجل المحادثة التي أُنشئت منها هذه الحزمة، أو ببساطة: تنظيف CSS،
إصلاح أزرار الشراء المعطوبة، نظام شراء حقيقي قابل للربط بـ Google Play
Billing، صعوبة تصاعدية حقيقية للمراحل، تأثيرات بصرية جديدة، ومسار عمل
بلا إنترنت للأصوات ومحرك الفيزياء.
