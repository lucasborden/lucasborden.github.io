const links = document.querySelectorAll(".nav-links a");
const currentPath = window.location.pathname.replace(/\/$/, ""); // remove trailing slash

links.forEach(link => {
  const hrefPath = new URL(link.href).pathname.replace(/\/$/, "");
  if (hrefPath === currentPath) {
    link.classList.add("active");
  } else {
    link.classList.remove("active"); // explicitly remove from others
  }
});
