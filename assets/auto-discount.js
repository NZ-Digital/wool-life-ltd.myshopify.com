(function () {
  var DISCOUNT_CODE = 'FREESHIP';
  var TARGET_PRODUCT_ID = 7620001464381; // dog bed product id
  var ELIGIBLE_VARIANTS = ['large', 'medium'];

  // --- Discount helpers (non-overwrite + removal) ---
  function getCookie(name) {
    try {
      var value = document.cookie.split('; ').find(function (row) { return row.indexOf(name + '=') === 0; });
      return value ? decodeURIComponent(value.split('=')[1]) : '';
    } catch (e) {
      return '';
    }
  }

  function setCookie(name, value, days) {
    try {
      var expires = '';
      if (typeof days === 'number') {
        var date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        expires = '; expires=' + date.toUTCString();
      }
      document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/';
    } catch (e) {}
  }

  function deleteCookie(name) {
    try {
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    } catch (e) {}
  }

  function getAppliedDiscountCodes() {
    // Shopify typically stores applied code(s) in a cookie like "discount_code".
    // Some themes/apps may also mirror in a "discount" cookie. Read both.
    var codes = [];
    var primary = String(getCookie('discount_code') || '').trim();
    var secondary = String(getCookie('discount') || '').trim();
    var raw = primary || secondary;
    if (!raw) return codes;
    raw.split(',').forEach(function (c) {
      var code = String(c || '').trim();
      if (code) codes.push(code.toLowerCase());
    });
    return codes;
  }

  function hasAnyDiscountApplied() {
    return getAppliedDiscountCodes().length > 0;
  }

  function isOurDiscountApplied() {
    var lc = String(DISCOUNT_CODE).toLowerCase();
    return getAppliedDiscountCodes().indexOf(lc) !== -1;
  }

  function isOurDiscountInCartObject(cart) {
    try {
      var lc = String(DISCOUNT_CODE).toLowerCase();
      var apps = (cart && cart.cart_level_discount_applications) || [];
      return apps.some(function (a) {
        var title = (a && (a.title || a.code || a.description)) || '';
        return String(title).trim().toLowerCase() === lc;
      });
    } catch (e) {
      return false;
    }
  }

  function removeOurDiscount() {
    try {
      var codes = getAppliedDiscountCodes();
      if (!codes.length) return;
      var lc = String(DISCOUNT_CODE).toLowerCase();
      if (codes.indexOf(lc) === -1) return; // our code not present

      var remaining = codes.filter(function (c) { return c !== lc; });
      if (remaining.length === 0) {
        // No other codes remain, clear cookies entirely
        deleteCookie('discount_code');
        deleteCookie('discount');
      } else {
        // Preserve other codes if present
        setCookie('discount_code', remaining.join(','), 30);
      }
    } catch (e) {}
  }

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

  function clearAppliedForToken(token) {
    try {
      if (!token) return;
      var map = getAppliedTokens();
      if (map && map[token]) {
        delete map[token];
        sessionStorage.setItem('wl_discount_applied_tokens', JSON.stringify(map));
      }
    } catch (e) {}
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

        var eligible = hasEligibleItem(cart);
        if (!eligible) {
          // Not eligible: clear our discount (only if ours) and our token flag
          clearAppliedForToken(cart.token);
          if (isOurDiscountApplied() || isOurDiscountInCartObject(cart)) {
            removeOurDiscount();
            // Refresh cart view so the discount state reflects removal
            try {
              if (location.pathname.indexOf('/cart') === 0) {
                setTimeout(function () { location.reload(); }, 50);
              }
            } catch (e) {}
          }
          return;
        }

        // Eligible: do not overwrite any existing discount
        if (hasAnyDiscountApplied()) return;
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
    // Listen for common cart events across themes/apps
    ['cart:updated', 'cart:update', 'cart:change', 'cart-updated'].forEach(function (evt) {
      try { document.addEventListener(evt, checkAndApply); } catch (e) {}
    });
    // Fallback: after any click inside cart/drawer, re-check shortly
    document.addEventListener('click', function (e) {
      try {
        var el = e.target;
        if (!el) return;
        var withinCartForm = !!(el.closest && (el.closest('form[action="/cart"]') || el.closest('#CartDrawer') || el.closest('[data-cart]')));
        if (withinCartForm) {
          setTimeout(checkAndApply, 300);
        }
      } catch (e2) {}
    });
    // Short-lived periodic check after load as a safety net
    try {
      var start = Date.now();
      var interval = setInterval(function () {
        if (Date.now() - start > 30000) { clearInterval(interval); return; }
        checkAndApply();
      }, 5000);
    } catch (e) {}
  } catch (e) {}
})();


