(function () {
  var DISCOUNT_CODE = 'FREESHIP';
  var TARGET_PRODUCT_ID = 7620001464381; // dog bed product id
  var ELIGIBLE_VARIANTS = ['large', 'medium'];

  function fetchCart() {
    return fetch('/cart.js', { credentials: 'same-origin' }).then(function (r) {
      return r.json();
    });
  }

  function hasEligibleItem(cart) {
    if (!cart || !Array.isArray(cart.items)) return false;
    return cart.items.some(function (item) {
      if (item.product_id !== TARGET_PRODUCT_ID) return false;
      if (!item.variant_title) return false;
      var vt = String(item.variant_title).trim().toLowerCase();
      // match if exact or part of a multi-option title like "Large / Grey"
      return ELIGIBLE_VARIANTS.some(function (v) { return vt.indexOf(v) !== -1; });
    });
  }

  function hasAnyDiscount(cart) {
    if (!cart) return false;
    if (Array.isArray(cart.discount_codes) && cart.discount_codes.length > 0) return true;
    if (Array.isArray(cart.cart_level_discount_applications) && cart.cart_level_discount_applications.length > 0) return true;
    if (Array.isArray(cart.items)) {
      for (var i = 0; i < cart.items.length; i++) {
        var it = cart.items[i];
        if (Array.isArray(it.discount_allocations) && it.discount_allocations.length > 0) return true;
        if (Array.isArray(it.discounts) && it.discounts.length > 0) return true;
      }
    }
    return false;
  }

  function hasOurDiscount(cart) {
    try {
      if (Array.isArray(cart.discount_codes)) {
        return cart.discount_codes.some(function (d) {
          var code = (d && (d.code || d)) || '';
          return String(code).toUpperCase() === String(DISCOUNT_CODE).toUpperCase();
        });
      }
      if (Array.isArray(cart.cart_level_discount_applications)) {
        return cart.cart_level_discount_applications.some(function (d) {
          var code = (d && (d.code || d.title)) || '';
          return String(code).toUpperCase() === String(DISCOUNT_CODE).toUpperCase();
        });
      }
    } catch (e) {}
    return false;
  }

  function isOnCartPage() {
    try { return window.location && typeof window.location.pathname === 'string' && window.location.pathname.indexOf('/cart') === 0; } catch (e) { return false; }
  }

  var PENDING_REMOVE_KEY = 'wl_remove_discount_on_cart';
  function scheduleRemoveOnNextCartView() {
    try { sessionStorage.setItem(PENDING_REMOVE_KEY, '1'); } catch (e) {}
  }
  function consumeScheduledRemoveFlag() {
    try {
      if (sessionStorage.getItem(PENDING_REMOVE_KEY) === '1') {
        sessionStorage.removeItem(PENDING_REMOVE_KEY);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function getAppliedTokens() {
    try {
      return JSON.parse(sessionStorage.getItem('wl_discount_applied_tokens') || '{}');
    } catch (e) {
      return {};
    }
  }

  function setAppliedForToken(token) {
    try {
      var map = getAppliedTokens();
      map[token] = true;
      sessionStorage.setItem('wl_discount_applied_tokens', JSON.stringify(map));
    } catch (e) {}
  }

  function alreadyAppliedForToken(token) {
    if (!token) return false;
    var map = getAppliedTokens();
    return !!map[token];
  }

  function applyDiscount() {
    var redirect = '/cart';
    var url = '/discount/' + encodeURIComponent(DISCOUNT_CODE) + '?redirect=' + encodeURIComponent(redirect);
    window.location.href = url;
  }

  function removeDiscount() {
    // Apply a guaranteed-nonexistent code to clear current code, redirect only on cart
    var redirect = '/cart';
    var url = '/discount/' + encodeURIComponent('CLEAR') + '?redirect=' + encodeURIComponent(redirect);
    if (!isOnCartPage()) {
      scheduleRemoveOnNextCartView();
      return;
    }
    try { window.location.href = url; } catch (e) { try { window.location.assign(url); } catch (e2) {} }
  }

  function checkAndApply() {
    fetchCart()
      .then(function (cart) {
        if (!cart || !cart.token) return;
        var eligible = hasEligibleItem(cart);
        if (!eligible) {
          if (hasOurDiscount(cart)) {
            removeDiscount();
          }
          return;
        }
        // If any coupon/discount exists, do not auto-apply FREESHIP
        if (hasAnyDiscount(cart)) return;
        if (alreadyAppliedForToken(cart.token)) return;
        setAppliedForToken(cart.token);
        applyDiscount();
      })
      .catch(function () {});
  }

  function processScheduledRemovalIfNeeded() {
    if (!isOnCartPage()) return;
    if (!consumeScheduledRemoveFlag()) return;
    fetchCart()
      .then(function (cart) {
        if (hasOurDiscount(cart)) removeDiscount();
      })
      .catch(function () {});
  }

  // Run on cart updates via theme pub/sub if available
  try {
    if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined' && PUB_SUB_EVENTS.cartUpdate) {
      subscribe(PUB_SUB_EVENTS.cartUpdate, function () {
        checkAndApply();
        processScheduledRemovalIfNeeded();
      });
    }
  } catch (e) {}

  // Also run when page becomes visible or on load, to catch existing carts
  try {
    window.addEventListener('pageshow', function () {
      checkAndApply();
      processScheduledRemovalIfNeeded();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        checkAndApply();
        processScheduledRemovalIfNeeded();
      }
    });
  } catch (e) {}
})();


