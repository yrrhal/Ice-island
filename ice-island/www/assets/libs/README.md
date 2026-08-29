# محرك الفيزياء Matter.js (اجعل اللعبة تعمل بلا إنترنت)

اللعبة تحاول تحميل `matter.min.js` من هذا المجلد أولًا، وإن فشل التحميل
تسقط تلقائيًا على نسخة CDN (jsDelivr) كحل احتياطي مؤقت. هذا يعني أن اللعبة
تعمل بدون هذا الملف، لكن محرك الفيزياء نفسه — وهو صلب اللعبة بالكامل —
سيتعطل تمامًا إن انقطع الإنترنت ولم تتوفر هذه النسخة المحلية.

**للنشر النهائي على Google Play، هذه الخطوة ليست اختيارية.**

## كيف توفّرها

من جهازك (حيث يتوفر إنترنت):

```bash
npm install matter-js@0.19.0
cp node_modules/matter-js/build/matter.min.js www/assets/libs/matter.min.js
```

أو نزّل الملف مباشرة من:
https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js

وضعه هنا باسم `matter.min.js` بالضبط.
