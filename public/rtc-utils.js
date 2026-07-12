(() => {
  "use strict";

  function filterIceServers(servers) {
    return servers.filter((s) => {
      if (!s?.urls) return false;
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      const isTurn = urls.some(
        (u) => String(u).startsWith("turn:") || String(u).startsWith("turns:")
      );
      return !isTurn || (s.username && s.credential);
    });
  }

  function wsUrl() {
    if (location.protocol === "file:") return null;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${location.host}`;
  }

  function scaledSize(width, height, maxWidth) {
    if (width <= maxWidth) return { width, height };
    const scale = maxWidth / width;
    return {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    };
  }

  window.RemoteSupportRtc = {
    filterIceServers,
    wsUrl,
    scaledSize,
  };
})();