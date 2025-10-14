(function () {
  var DISCOUNT_CODE = 'FREESHIP';
  var TARGET_PRODUCT_ID = 7620001464381; // dog bed product id
  var ELIGIBLE_VARIANTS = ['large', 'medium'];
  var WL_DISCOUNT_VERSION = 'wl-auto-discount v2025-10-14';

  function log() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[WL-Discount]');
      // eslint-disable-next-line no-console
      console.log.apply(console, args);
    } catch (e) {}
  }

  log('init', WL_DISCOUNT_VERSION);

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
      // Attempt deletion across likely domain scopes
      var domains = [location.hostname];
      try {
        var parts = location.hostname.split('.');
        if (parts.length > 2) domains.push(parts.slice(-2).join('.'));
        if (parts.length > 1) domains.push(parts.slice(-2).join('.'));
      } catch (e) {}
      // Ensure uniqueness
      var seen = {};
      domains.forEach(function (d) { if (d && !seen[d]) seen[d] = true; });
      Object.keys(seen).forEach(function (domain) {
        try {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + domain;
        } catch (e) {}
      });
      // Fallback: no domain attribute
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
      log('removeOurDiscount: current=', codes, 'remaining=', remaining);
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

  function forceClearDiscountViaRedirect(cartToken) {
    try {
      var guardKey = 'wl_discount_force_clear_' + String(cartToken || 'noct');
      if (sessionStorage.getItem(guardKey)) return;
      sessionStorage.setItem(guardKey, '1');
      var back = (location.pathname + location.search + location.hash) || '/cart';
      var bogus = '__clear__' + Date.now();
      // Replace any server-side applied code by routing through a bogus discount
      var url = '/discount/' + encodeURIComponent(bogus) + '?redirect=' + encodeURIComponent(back);
      log('forceClearDiscountViaRedirect ->', url);
      window.location.href = url;
    } catch (e) {}
  }

  function scheduleGotoCheckoutNoDiscount() {
    try {
      sessionStorage.setItem('wl_go_checkout_no_discount', '1');
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
    log('applyDiscount ->', DISCOUNT_CODE, 'redirect=', url);
    window.location.href = url;
  }

  function checkAndApply() {
    log('checkAndApply: start');
    fetchCart()
      .then(function (cart) {
        if (!cart || !cart.token) return;

        var eligible = hasEligibleItem(cart);
        log('checkAndApply: eligible?', eligible, 'cartToken=', cart.token);
        if (!eligible) {
          // Not eligible: clear our discount (only if ours) and our token flag
          clearAppliedForToken(cart.token);
          var oursApplied = isOurDiscountApplied() || isOurDiscountInCartObject(cart);
          log('checkAndApply: oursApplied?', oursApplied);
          if (oursApplied) {
            removeOurDiscount();
            // Server-side fallback: force replace discount via bogus redirect
            forceClearDiscountViaRedirect(cart.token);
          }
          return;
        }

        // Eligible: do not overwrite any existing discount
        var anyApplied = hasAnyDiscountApplied();
        if (anyApplied) {
          log('checkAndApply: skip apply, some discount already applied');
          return;
        }
        if (alreadyAppliedForToken(cart.token)) {
          log('checkAndApply: skip apply, token already applied');
          return;
        }
        setAppliedForToken(cart.token);
        log('checkAndApply: applying now');
        applyDiscount();
      })
      .catch(function () {});
  }

  // Run on cart updates via theme pub/sub if available
  try {
    if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined' && PUB_SUB_EVENTS.cartUpdate) {
      subscribe(PUB_SUB_EVENTS.cartUpdate, function () {
        log('event: PUB_SUB cartUpdate');
        checkAndApply();
      });
    }
  } catch (e) {}

  // Also run when page becomes visible or on load, to catch existing carts
  try {
    window.addEventListener('pageshow', function () {
      log('event: pageshow');
      try {
        if (sessionStorage.getItem('wl_go_checkout_no_discount') === '1') {
          sessionStorage.removeItem('wl_go_checkout_no_discount');
          log('pageshow: go to checkout without discount');
          window.location.href = '/checkout?discount=';
          return;
        }
      } catch (e) {}
      checkAndApply();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        log('event: visibilitychange -> visible');
        checkAndApply();
      }
    });
    // Listen for common cart events across themes/apps
    ['cart:updated', 'cart:update', 'cart:change', 'cart-updated'].forEach(function (evt) {
      try {
        document.addEventListener(evt, function () {
          log('event:', evt);
          checkAndApply();
        });
      } catch (e) {}
    });
    // Fallback: after any click inside cart/drawer, re-check shortly
    document.addEventListener('click', function (e) {
      try {
        var el = e.target;
        if (!el) return;
        var withinCartForm = !!(el.closest && (el.closest('form[action="/cart"]') || el.closest('#CartDrawer') || el.closest('[data-cart]')));
        if (withinCartForm) {
          log('event: click within cart UI');
          setTimeout(checkAndApply, 300);
        }

        // Intercept explicit checkout clicks
        var isCheckoutTrigger = !!(el.closest && (el.closest('button[name="checkout"]') || el.closest('input[name="checkout"]') || el.closest('a[href*="/checkout"]')));
        if (isCheckoutTrigger) {
          log('event: checkout trigger click');
          try {
            e.preventDefault();
          } catch (e1) {}
          fetchCart().then(function (cart) {
            if (!cart || !cart.token) { window.location.href = '/checkout'; return; }
            var eligible = hasEligibleItem(cart);
            var oursApplied = isOurDiscountApplied() || isOurDiscountInCartObject(cart);
            var codes = getAppliedDiscountCodes();
            var codesLower = codes.slice();
            var hasOtherNonFreeship = codesLower.some(function (c) { return c !== String(DISCOUNT_CODE).toLowerCase(); });
            log('checkout intercept: eligible?', eligible, 'oursApplied?', oursApplied, 'codes=', codesLower);
            if (!eligible) {
              // If ineligible, ensure FREESHIP is not carried into checkout.
              // Only preserve if another non-FREESHIP code is clearly present in cookies.
              if (!hasOtherNonFreeship) {
                clearAppliedForToken(cart.token);
                removeOurDiscount();
                scheduleGotoCheckoutNoDiscount();
                forceClearDiscountViaRedirect(cart.token);
                return;
              }
            }
            window.location.href = '/checkout';
          }).catch(function () { window.location.href = '/checkout'; });
        }
      } catch (e2) {}
    });
    // Short-lived periodic check after load as a safety net
    try {
      var start = Date.now();
      var interval = setInterval(function () {
        if (Date.now() - start > 30000) { clearInterval(interval); return; }
        log('interval: periodic check');
        checkAndApply();
      }, 5000);
    } catch (e) {}
  } catch (e) {}
})();


