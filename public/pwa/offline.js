if (window.location.pathname === "/share-filament") {
  const params = new URLSearchParams(window.location.search);
  const share = [params.get("url"), params.get("text"), params.get("title")].find(value => value && value.length <= 8192);
  if (share) {
    document.getElementById("shared-message").hidden = false;
    const link = document.getElementById("shared-link");
    link.textContent = share;
    link.hidden = false;
  }
}
document.getElementById("retry").addEventListener("click", () => window.location.reload());
