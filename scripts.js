const links = document.querySelectorAll(".nav-links a");
const currentPath = window.location.pathname.replace(/\/$/, ""); // remove trailing slash

links.forEach(link => {
  const linkPath = new URL(link.href).pathname.replace(/\/$/, ""); // normalize path
  if (linkPath === currentPath) {
    link.classList.add("active");
  }
});
