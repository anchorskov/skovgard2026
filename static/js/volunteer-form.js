// static/js/volunteer-form.js
document.addEventListener("DOMContentLoaded", () => {
  const frame = document.getElementById("gform");
  if (!frame) return;

  frame.addEventListener("load", () => {
    let url;
    try {
      // Google blocks cross-origin read, so wrap in try/catch
      url = frame.contentWindow.location.href;
    } catch (_) {
      // fallback: read src attribute
      url = frame.src;
    }

    // After submit Google redirects to .../formResponse
    if (url.includes("formResponse")) {
      // Scroll smoothly to the top
      window.scrollTo({ top: 0, behavior: "smooth" });
      // Optional: flash a thank-you toast
      const note = document.createElement("div");
      note.textContent = "Thanks for volunteering! We’ll be in touch.";
      note.className =
        "fixed top-4 left-1/2 -translate-x-1/2 bg-green-600 text-white py-2 px-4 rounded-lg shadow-lg z-50";
      document.body.appendChild(note);
      setTimeout(() => note.remove(), 5000);
    }
  });
});
