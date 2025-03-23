const links = document.querySelectorAll(".nav-links a");
const currentPath = window.location.pathname.replace(/\/$/, ""); // remove trailing slash

links.forEach(link => {
  const linkPath = new URL(link.href).pathname.replace(/\/$/, ""); // normalize link href
  const isRoot = currentPath === "" || currentPath === "/index.html";

  if (
    (linkPath === "/" && isRoot) || // match About at root
    linkPath === currentPath         // match other pages like /projects
  ) {
    link.classList.add("active");
  }
});
