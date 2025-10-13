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

  function checkAndApply() {
    fetchCart()
      .then(function (cart) {
        if (!cart || !cart.token) return;
        if (!hasEligibleItem(cart)) return;
        if (alreadyAppliedForToken(cart.token)) return;
        setAppliedForToken(cart.token);
        applyDiscount();
      })
      .catch(function () {});
  }

  // Run on cart updates via theme pub/sub if available
  try {
    if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined' && PUB_SUB_EVENTS.cartUpdate) {
      subscribe(PUB_SUB_EVENTS.cartUpdate, function () {
        checkAndApply();
      });
    }
  } catch (e) {}

  // Also run when page becomes visible or on load, to catch existing carts
  try {
    window.addEventListener('pageshow', function () {
      checkAndApply();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkAndApply();
    });
  } catch (e) {}
})();


