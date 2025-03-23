const links = document.querySelectorAll(".nav-links a");
const currentPage = window.location.pathname.split("/").filter(Boolean).pop(); // get last part of path

links.forEach(link => {
  const linkPage = link.getAttribute("href").split("/").filter(Boolean).pop();
  if (linkPage === currentPage || (currentPage === undefined && linkPage === "about")) {
    link.classList.add("active");
  }
});
