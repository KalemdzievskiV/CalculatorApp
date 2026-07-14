/* MDA аналитика — мал клиент без колачиња.
   Праќа преглед на страница при вчитување и именувани настани преку mdaTrack(). */
(function () {
  function send(payload) {
    try {
      const body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
      } else {
        fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
      }
    } catch (e) { /* тивко */ }
  }

  // Јавен помошник за настани (калкулатор, модели, дограма…)
  window.mdaTrack = function (event) {
    if (event) send({ event: String(event).slice(0, 40) });
  };

  // Преглед на страница (референтот е надворешен извор на посета)
  send({ path: location.pathname, ref: document.referrer || '' });

  // Автоматски: кликови на телефонски број
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('a[href^="tel:"]');
    if (a) window.mdaTrack('phone_click');
  }, { passive: true });
})();
