// Comportamenti comuni senza script inline (la CSP li vieta).
(function () {
  // <form data-confirm="..."> chiede conferma prima dell'invio, come window.confirm nel desktop.
  document.addEventListener("submit", function (event) {
    var message = event.target.getAttribute("data-confirm");
    if (message && !window.confirm(message)) event.preventDefault();
  });

  // I messaggi di conferma spariscono da soli; gli errori restano.
  document.querySelectorAll("[data-autohide='1']").forEach(function (el) {
    setTimeout(function () {
      el.remove();
    }, 3000);
  });

  // Avviso se si lascia una pagina con un form modificato e non salvato.
  document.querySelectorAll("form[data-dirty-guard]").forEach(function (form) {
    var dirty = false;
    form.addEventListener("input", function () {
      dirty = true;
    });
    form.addEventListener("submit", function () {
      dirty = false;
    });
    window.addEventListener("beforeunload", function (event) {
      if (dirty) event.preventDefault();
    });
  });
})();
