// Tema chiaro/scuro su data-theme di <html>, come studyforge/src/lib/uiStore.ts (default: dark).
(function () {
  var KEY = "rstudy-theme";
  var root = document.documentElement;
  try {
    var saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") root.setAttribute("data-theme", saved);
  } catch (e) {}

  document.addEventListener("click", function (event) {
    // data-theme-set="light|dark" sceglie un tema preciso (Impostazioni), data-theme-toggle lo alterna.
    var set = event.target.closest("[data-theme-set]");
    if (!set && !event.target.closest("[data-theme-toggle]")) return;
    var next = set ? set.getAttribute("data-theme-set") : root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch (e) {}
  });
})();
