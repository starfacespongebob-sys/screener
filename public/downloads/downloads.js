fetch("/downloads/agent-release.json")
  .then((r) => r.json())
  .then((m) => {
    const file = m.downloadUrl.split("/").pop();
    const primary = document.getElementById("primaryDownload");
    const installCmd = document.getElementById("installCmd");
    const releaseMeta = document.getElementById("releaseMeta");
    const latestLink = document.getElementById("latestFileLink");

    if (primary) {
      primary.href = m.downloadUrl;
      primary.textContent = "Download v" + m.version + " Setup";
    }
    if (installCmd) {
      installCmd.textContent = file + " " + m.installArgs;
    }
    if (releaseMeta) {
      releaseMeta.innerHTML =
        "Version <strong>" + m.version + "</strong><br>" +
        "SHA256: <code>" + m.sha256 + "</code><br>" +
        "Published: " + m.publishedAt;
    }
    if (latestLink) {
      latestLink.href = m.downloadUrl;
      latestLink.textContent = file;
    }
  })
  .catch(() => {
    const releaseMeta = document.getElementById("releaseMeta");
    if (releaseMeta) {
      releaseMeta.textContent = "Release manifest unavailable.";
    }
  });