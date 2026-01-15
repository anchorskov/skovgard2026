// static/js/site-ui.js

function readMeta(name, fallback = "") {
  const el = document.querySelector(`meta[name="${name}"]`);
  return el ? el.content : fallback;
}

function applyThemeFromStorage() {
  const body = document.body;
  if (!body) return;

  const defaultTheme = readMeta("pm-default-theme", "auto");
  const disableToggle = readMeta("pm-disable-theme-toggle", "false") === "true";
  const pref = localStorage.getItem("pref-theme");
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

  if (disableToggle && defaultTheme !== "light" && defaultTheme !== "dark") {
    if (prefersDark) body.classList.add("dark");
    return;
  }

  if (pref === "dark") {
    body.classList.add("dark");
    return;
  }
  if (pref === "light") {
    body.classList.remove("dark");
    return;
  }

  if (defaultTheme === "dark") {
    body.classList.add("dark");
  } else if (defaultTheme === "light") {
    body.classList.remove("dark");
  } else if (prefersDark) {
    body.classList.add("dark");
  }
}

function persistMenuScroll() {
  const menu = document.getElementById("menu");
  if (!menu) return;
  const saved = localStorage.getItem("menu-scroll-position");
  if (saved) menu.scrollLeft = saved;
  menu.addEventListener("scroll", () => {
    localStorage.setItem("menu-scroll-position", menu.scrollLeft);
  });
}

function enableSmoothAnchors() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      event.preventDefault();
      const id = anchor.getAttribute("href").slice(1);
      const target = document.querySelector(`[id='${decodeURIComponent(id)}']`);
      if (!target) return;

      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        target.scrollIntoView({ behavior: "smooth" });
      } else {
        target.scrollIntoView();
      }

      if (id === "top") {
        history.replaceState(null, null, " ");
      } else {
        history.pushState(null, null, `#${id}`);
      }
    });
  });
}

function setupTopLinkVisibility() {
  const topLink = document.getElementById("top-link");
  if (!topLink) return;
  const toggleVisibility = () => {
    const scrolled = document.body.scrollTop > 800 || document.documentElement.scrollTop > 800;
    topLink.style.visibility = scrolled ? "visible" : "hidden";
    topLink.style.opacity = scrolled ? "1" : "0";
  };
  toggleVisibility();
  window.addEventListener("scroll", toggleVisibility);
}

function setupThemeToggleButton() {
  const toggle = document.getElementById("theme-toggle");
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    if (document.body.classList.contains("dark")) {
      document.body.classList.remove("dark");
      localStorage.setItem("pref-theme", "light");
    } else {
      document.body.classList.add("dark");
      localStorage.setItem("pref-theme", "dark");
    }
  });
}

function setupCodeCopyButtons() {
  const shouldShow = readMeta("pm-show-code-copy", "false") === "true";
  if (!shouldShow) return;

  document.querySelectorAll("pre > code").forEach((codeblock) => {
    const container = codeblock.parentNode?.parentNode;
    if (!container) return;

    const copybutton = document.createElement("button");
    copybutton.classList.add("copy-code");
    copybutton.textContent = "copy";

    const copyingDone = () => {
      copybutton.textContent = "copied!";
      setTimeout(() => {
        copybutton.textContent = "copy";
      }, 2000);
    };

    copybutton.addEventListener("click", () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(codeblock.textContent || "");
        copyingDone();
        return;
      }

      const range = document.createRange();
      range.selectNodeContents(codeblock);
      const selection = window.getSelection();
      if (!selection) return;
      selection.removeAllRanges();
      selection.addRange(range);
      try {
        document.execCommand("copy");
        copyingDone();
      } catch {
        // ignore
      }
      selection.removeRange(range);
    });

    if (container.classList.contains("highlight")) {
      container.appendChild(copybutton);
    } else if (container.parentNode?.firstChild === container) {
      // td containing LineNos
    } else if (codeblock.parentNode?.parentNode?.parentNode?.parentNode?.parentNode?.nodeName === "TABLE") {
      codeblock.parentNode.parentNode.parentNode.parentNode.parentNode.appendChild(copybutton);
    } else {
      codeblock.parentNode.appendChild(copybutton);
    }
  });
}

applyThemeFromStorage();

document.addEventListener("DOMContentLoaded", () => {
  persistMenuScroll();
  enableSmoothAnchors();
  setupTopLinkVisibility();
  setupThemeToggleButton();
  setupCodeCopyButtons();
});
