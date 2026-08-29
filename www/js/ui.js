/* =====================================================================
   نظام الواجهة المخصص — js/ui.js
   =====================================================================
   يوفر UIModal.alert()/UIModal.confirm() كبديل لنوافذ alert()/confirm()
   الأصلية في المتصفح، والتي:
   - تجربتها رديئة داخل تطبيق مبني بـ WebView (تصميم غير متسق مع اللعبة)
   - قد لا تظهر إطلاقًا داخل بعض أغلفة WebView الأصلية دون إعداد إضافي

   كل عناصر الواجهة هنا تُنشأ ديناميكيًا بجافاسكريبت، لذلك لا حاجة لتعديل
   بنية index.html من أجلها.
   ===================================================================== */

const UIModal = (() => {
  let overlay = null;

  function ensureDom() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.className = 'ui-modal-overlay';
    overlay.innerHTML = `
      <div class="ui-modal-box">
        <div class="ui-modal-message"></div>
        <div class="ui-modal-actions">
          <button class="ui-modal-btn ui-modal-btn-secondary" data-role="cancel" style="display:none">إلغاء</button>
          <button class="ui-modal-btn ui-modal-btn-primary" data-role="ok">حسنًا</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
  }

  function show(message, { showCancel = false, onOk = null, onCancel = null } = {}) {
    ensureDom();
    const msgEl = overlay.querySelector('.ui-modal-message');
    const okBtn = overlay.querySelector('[data-role="ok"]');
    const cancelBtn = overlay.querySelector('[data-role="cancel"]');
    msgEl.textContent = message;
    cancelBtn.style.display = showCancel ? 'inline-block' : 'none';

    const cleanup = () => {
      overlay.classList.remove('open');
      okBtn.onclick = null;
      cancelBtn.onclick = null;
    };
    okBtn.onclick = () => { cleanup(); if (onOk) onOk(); };
    cancelBtn.onclick = () => { cleanup(); if (onCancel) onCancel(); };

    overlay.classList.add('open');
    if (typeof playSound === 'function') { try { playSound('click', 0.12); } catch (e) {} }
  }

  return {
    alert(message) {
      show(message, { showCancel: false });
    },
    confirm(message, onConfirm, onCancel) {
      show(message, { showCancel: true, onOk: onConfirm, onCancel: onCancel });
    }
  };
})();

/* ===== زر استعادة المشتريات — يُضاف تلقائيًا داخل تبويب "كوين" بالمتجر ===== */
document.addEventListener('DOMContentLoaded', () => {
  const coinsTab = document.getElementById('shop-coins');
  if (coinsTab && !document.getElementById('restore-purchases-btn')) {
    const restoreBtn = document.createElement('button');
    restoreBtn.id = 'restore-purchases-btn';
    restoreBtn.className = 'ui-restore-btn';
    restoreBtn.textContent = '↻ استعادة المشتريات';
    restoreBtn.onclick = () => IAPManager.restorePurchases();
    coinsTab.appendChild(restoreBtn);
  }
});
