// ============================================================
// FANTASY ARENA — cookie-banner.js
// GDPR cookie consent banner
// Consenso salvato in localStorage: "ucl_cookie_consent"
//   "accepted" → analytics attivi
//   "rejected" → solo cookie tecnici
// ============================================================

(function () {
  const STORAGE_KEY = "ucl_cookie_consent";
  const consent = localStorage.getItem(STORAGE_KEY);

  // Se ha già scelto, aggiorna il consenso GA4 e non mostrare il banner
  if (consent === "accepted") {
    window._cookieConsent = true;
    grantAnalytics();
    return;
  }
  if (consent === "rejected") {
    window._cookieConsent = false;
    return;
  }

  // Prima visita: mostra il banner dopo 800ms
  setTimeout(showBanner, 800);

  function showBanner() {
    const banner = document.createElement("div");
    banner.id = "cookieBanner";
    banner.innerHTML = `
      <div style="
        position:fixed;bottom:0;left:0;right:0;z-index:99999;
        background:#1a1d2e;border-top:1px solid #2d3148;
        padding:16px 20px;display:flex;align-items:center;
        gap:16px;flex-wrap:wrap;justify-content:space-between;
        box-shadow:0 -4px 24px rgba(0,0,0,.5);
        font-family:'Inter',Arial,sans-serif;font-size:13px;
        animation:slideUp .3s ease-out;
      ">
        <style>@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}</style>
        <div style="flex:1;min-width:220px;color:#a0aec0;line-height:1.5">
          🍪 Usiamo cookie tecnici necessari al funzionamento e, con il tuo consenso,
          cookie analitici (Google Analytics) per migliorare il servizio.
          <a href="cookie-policy.html" style="color:#818cf8;text-decoration:none;white-space:nowrap"> Cookie Policy</a>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
          <button id="cookieReject" style="
            background:none;border:1px solid #4b5563;color:#9ca3af;
            padding:8px 18px;border-radius:8px;cursor:pointer;
            font-size:13px;font-weight:600;transition:all .2s;white-space:nowrap;
          " onmouseover="this.style.borderColor='#6b7280';this.style.color='#d1d5db'"
             onmouseout="this.style.borderColor='#4b5563';this.style.color='#9ca3af'">
            Solo tecnici
          </button>
          <button id="cookieAccept" style="
            background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;
            padding:8px 22px;border-radius:8px;cursor:pointer;
            font-size:13px;font-weight:700;transition:opacity .2s;white-space:nowrap;
          " onmouseover="this.style.opacity='.85'"
             onmouseout="this.style.opacity='1'">
            Accetta tutto
          </button>
        </div>
      </div>`;

    document.body.appendChild(banner);

    document.getElementById("cookieAccept").addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEY, "accepted");
      window._cookieConsent = true;
      grantAnalytics();
      hideBanner(banner);
    });

    document.getElementById("cookieReject").addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEY, "rejected");
      window._cookieConsent = false;
      hideBanner(banner);
    });
  }

  function hideBanner(banner) {
    banner.firstElementChild.style.animation = "none";
    banner.firstElementChild.style.transition = "transform .3s ease-in, opacity .3s";
    banner.firstElementChild.style.transform = "translateY(100%)";
    banner.firstElementChild.style.opacity = "0";
    setTimeout(() => banner.remove(), 350);
  }

  function grantAnalytics() {
    // Sblocca la raccolta dati GA4 (Consent Mode v2)
    if (typeof gtag === "function") {
      gtag("consent", "update", {
        analytics_storage: "granted",
        ad_storage: "denied"  // ads non usati, rimane negato
      });
    }
  }

  // Esponi funzione globale per riaprire le preferenze cookie
  window.resetCookieConsent = function () {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  };
})();
