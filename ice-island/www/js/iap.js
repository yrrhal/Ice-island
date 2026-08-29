/* =====================================================================
   نظام الشراء داخل التطبيق (In-App Purchases) — js/iap.js
   =====================================================================
   هذا الملف يستبدل النظام القديم الذي كان يمنح العملة مباشرة بضغطة زر
   بدون أي بوابة دفع حقيقية. الآن أي عملية شراء تمر عبر IAPManager الذي
   يعمل في أحد ثلاثة أوضاع تلقائيًا حسب البيئة:

   1) native      — داخل تطبيق أندرويد مبني عبر Capacitor مع إضافة فوترة
                    مُثبّتة ومربوطة فعليًا بـ Google Play Billing.
   2) simulation  — أثناء التطوير/الاختبار في المتصفح: يعرض تنبيهًا صريحًا
                    أنه وضع اختبار ولا يوجد دفع حقيقي، ثم يمنح المكافأة.
   3) unavailable — التطبيق يعمل داخل غلاف أصلي لكن إضافة الفوترة غير
                    مربوطة بعد (لم تُستكمل خطوات docs/IAP_SETUP.md) —
                    يمنع الشراء بدل التصرف الصامت القديم.

   لإكمال الربط الحقيقي مع Google Play Billing: راجع docs/IAP_SETUP.md
   خطوة بخطوة. الأماكن التي تحتاج كودك الفعلي معلّمة بـ TODO أدناه.
   ===================================================================== */

const IAP_PRODUCTS = [
  {
    id: 'usd_099', playId: 'ice_island_coins_starter', priceLabel: '$0.99', title: '💰 حزمة البداية',
    grant: { coins: 500 }
  },
  {
    id: 'usd_499', playId: 'ice_island_coins_popular', priceLabel: '$4.99', title: '⭐ الأكثر شعبية',
    grant: { coins: 3000, iceBalls: 20 }
  },
  {
    id: 'usd_999', playId: 'ice_island_coins_value', priceLabel: '$9.99', title: '💎 باقة القيمة',
    grant: { coins: 6500, iceBalls: 50, ironBalls: 20 }
  },
  {
    id: 'usd_1999', playId: 'ice_island_coins_pro', priceLabel: '$19.99', title: '🚀 باقة المحترفين',
    grant: { coins: 14000, ironBalls: 100, extraPredict: 1 }
  },
  {
    id: 'usd_4999', playId: 'ice_island_coins_whale', priceLabel: '$49.99', title: '🏆 باقة الحوت',
    grant: { coins: 38000, normalBalls: 200, guns: { normal: 5, fire: 3, ice: 2 }, starBoosterHours: 1 }
  },
  {
    id: 'usd_9999', playId: 'ice_island_coins_legend', priceLabel: '$99.99', title: '👑 باقة الأسطورة',
    grant: { coins: 80000, normalBalls: 500, guns: { normal: 10, fire: 5, ice: 5 }, starBoosterHours: 3 }
  }
];

const IAPManager = {
  ready: false,
  mode: 'unknown', // 'native' | 'simulation' | 'unavailable'

  async init() {
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (isNative) {
      // ---------------------------------------------------------------
      // TODO (مطلوب منك): اربط إضافة Google Play Billing هنا فعليًا.
      // راجع docs/IAP_SETUP.md للخيارات المقترحة وخطوات التثبيت الكاملة.
      //
      // مثال متوقع بعد تثبيت الإضافة (الأسماء تقريبية، عدّلها حسب
      // الإضافة التي تختارها فعليًا):
      //
      //   import { Purchases } from 'your-chosen-capacitor-iap-plugin';
      //   await Purchases.initialize({ productIds: IAP_PRODUCTS.map(p => p.playId) });
      //   this.mode = 'native';
      //   this.ready = true;
      //   return;
      // ---------------------------------------------------------------
      console.warn('[IAP] لم يتم بعد ربط إضافة الفوترة الفعلية. راجع docs/IAP_SETUP.md');
      this.mode = 'unavailable';
    } else {
      this.mode = 'simulation';
    }
    this.ready = true;
  },

  getProduct(id) {
    return IAP_PRODUCTS.find(p => p.id === id);
  },

  async purchase(id) {
    const product = this.getProduct(id);
    if (!product) { UIModal.alert('منتج غير معروف.'); return; }

    if (this.mode === 'unavailable') {
      UIModal.alert('الشراء غير متاح على هذا الجهاز حاليًا. (إضافة الفوترة غير مربوطة بعد — راجع docs/IAP_SETUP.md)');
      return;
    }

    if (this.mode === 'simulation') {
      UIModal.confirm(
        `[وضع اختبار — لا يوجد دفع حقيقي]\n${product.title} بسعر ${product.priceLabel}.\nمنح المكافأة للاختبار؟`,
        () => {
          this._grant(product);
          UIModal.alert('✅ تم منح المكافأة (وضع اختبار فقط، لم يتم أي دفع حقيقي).');
        }
      );
      return;
    }

    if (this.mode === 'native') {
      // ---------------------------------------------------------------
      // TODO (مطلوب منك): نفّذ هنا نداء الشراء الفعلي عبر إضافة الفوترة،
      // وتحقّق من نجاح الدفع من طرف المتجر قبل استدعاء this._grant().
      // لا تمنح المكافأة أبدًا إلا بعد تأكيد صريح من Google Play.
      //
      //   const result = await Purchases.purchase({ productId: product.playId });
      //   if (result.success) this._grant(product);
      // ---------------------------------------------------------------
      UIModal.alert('اتصال المتجر غير مكتمل بعد من طرف المطوّر. راجع docs/IAP_SETUP.md.');
    }
  },

  _grant(product) {
    const g = product.grant;
    if (g.coins) inventory.coins += g.coins;
    if (g.normalBalls) { inventory.normalBalls += g.normalBalls; maxBalls += g.normalBalls; }
    if (g.iceBalls) inventory.iceBalls += g.iceBalls;
    if (g.ironBalls) inventory.ironBalls += g.ironBalls;
    if (g.guns) {
      inventory.guns.normal += (g.guns.normal || 0);
      inventory.guns.fire += (g.guns.fire || 0);
      inventory.guns.ice += (g.guns.ice || 0);
    }
    if (g.extraPredict) extraPredictAvailable += g.extraPredict;
    if (g.starBoosterHours) starBoosterUntil = Date.now() + g.starBoosterHours * 60 * 60 * 1000;
    saveInventory();
    updateAllUI();
    playSound('coin', 0.3);
  },

  async restorePurchases() {
    if (this.mode !== 'native') {
      UIModal.alert('استعادة المشتريات متاحة فقط داخل نسخة التطبيق المنشورة على المتجر.');
      return;
    }
    // TODO (مطلوب منك): نفّذ استدعاء استعادة المشتريات من إضافة الفوترة هنا.
    UIModal.alert('استعادة المشتريات غير مكتملة الربط بعد. راجع docs/IAP_SETUP.md.');
  }
};

document.addEventListener('DOMContentLoaded', () => IAPManager.init());
