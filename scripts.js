(function () {
  // Active nav link highlighting
  const links = document.querySelectorAll(".nav-links a");
  if (links.length) {
    const normalize = (path) => {
      path = path.split("?")[0].split("#")[0];
      path = path.replace(/\/$/, "") || "/";
      if (path.endsWith("/index.html")) path = path.replace(/\/index\.html$/, "") || "/";
      return path;
    };

    const currentPath = normalize(window.location.pathname);

    links.forEach((link) => {
      const href = link.getAttribute("href");
      const linkPath = normalize(new URL(href, window.location.origin).pathname);

      if (linkPath === currentPath) link.classList.add("active");
      else link.classList.remove("active");
    });
  }

  // Footer year (works even if multiple pages include the same footer)
  const yearEls = document.querySelectorAll("#year");
  if (yearEls.length) {
    const year = String(new Date().getFullYear());
    yearEls.forEach((el) => (el.textContent = year));
  }
})();
