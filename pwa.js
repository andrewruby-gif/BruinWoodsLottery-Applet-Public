(function () {
  "use strict";

  if (!("serviceWorker" in navigator) || !window.isSecureContext) return;

  var updateButton = document.getElementById("appUpdateBtn");
  var refreshing = false;

  function showUpdate(registration) {
    if (!updateButton || !registration.waiting) return;
    updateButton.classList.remove("hidden");
    updateButton.onclick = function () {
      updateButton.disabled = true;
      updateButton.textContent = "Updating...";
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    };
  }

  navigator.serviceWorker.addEventListener("controllerchange", function () {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  navigator.serviceWorker.register("service-worker.js").then(function (registration) {
    showUpdate(registration);
    registration.addEventListener("updatefound", function () {
      var worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", function () {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          showUpdate(registration);
        }
      });
    });
  }).catch(function (error) {
    console.warn("Offline support could not be enabled.", error);
  });
})();