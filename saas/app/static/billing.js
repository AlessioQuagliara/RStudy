// Checkout overlay di Paddle Billing. I dati arrivano da #paddle-config (niente script inline: la CSP li vieta).
(function () {
  var config = document.getElementById("paddle-config");
  if (!config || !window.Paddle) return;
  var d = config.dataset;
  if (d.environment === "sandbox") Paddle.Environment.set("sandbox");
  Paddle.Initialize({ token: d.token });

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-price-id]");
    if (!button) return;
    Paddle.Checkout.open({
      items: [{ priceId: button.dataset.priceId, quantity: 1 }],
      // Un cliente Paddle già esistente (abbonamento scaduto) viene riusato invece di crearne un altro.
      customer: d.customerId ? { id: d.customerId } : { email: d.email },
      // Il webhook collega l'abbonamento all'account tramite questo id.
      customData: { user_id: d.userId },
      settings: { successUrl: d.successUrl, locale: "it" },
    });
  });
})();
