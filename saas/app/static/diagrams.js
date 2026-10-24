// Scheda Schemi: disegna con Mermaid i blocchi [data-mermaid], porting di MermaidDiagram.tsx del desktop.
// Il codice sta in un <pre> (testo già escapato dal server); se non è valido resta visibile con un avviso.
(function () {
  if (!window.mermaid) return;
  var dark = document.documentElement.getAttribute("data-theme") !== "light";
  // strict: niente HTML né click nei nodi, il testo generato dall'AI non può eseguire nulla.
  window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: dark ? "dark" : "default" });

  document.querySelectorAll("[data-mermaid]").forEach(function (box, i) {
    var source = box.querySelector("pre").textContent.replace(/^\s*```(?:mermaid)?\s*/, "").replace(/```\s*$/, "").trim();
    var target = box.querySelector("[data-mermaid-target]");
    var id = "mermaid-" + i;
    window.mermaid.render(id, source).then(
      function (result) {
        target.innerHTML = result.svg;
      },
      function () {
        // Mermaid lascia nel body il nodo del tentativo fallito.
        var leaked = document.getElementById("d" + id);
        if (leaked) leaked.remove();
        target.textContent = "Impossibile disegnare il diagramma: qui sotto il codice Mermaid generato.";
        target.className = "alert alert-warning text-sm";
        box.querySelector("details").open = true;
      }
    );
  });
})();
