(function () {
  "use strict";

  var banner = document.getElementById("pricing-error-banner");

  function showMessage(text, tone) {
    if (!banner) return;
    banner.textContent = text;
    banner.classList.remove("is-hidden");
    banner.classList.toggle("info", tone === "info");
  }

  document.querySelectorAll("[data-plan]").forEach(function (button) {
    button.addEventListener("click", function () {
      var plan = button.getAttribute("data-plan");
      showMessage(
        "Checkout for the " + plan + " plan isn't connected to a payment backend yet — this is a demo build.",
        "info"
      );
    });
  });
})();
