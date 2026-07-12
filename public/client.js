(() => {
  "use strict";

  const el = (id) => document.getElementById(id);
  const RTC = window.RemoteSupportRtc;

  const connDot = el("connDot");
  const connLabel = el("connLabel");

  const joinCard = el("joinCard");
  const codeInput = el("codeInput");
  const joinBtn = el("joinBtn");
  const joinBanner = el("joinBanner");

  const waitingCard = el("waitingCard");
  const controlApprovalCard = el("controlApprovalCard");

  const shareCard = el("shareCard");
  const sessionStatusPill = el("sessionStatusPill");
  const shareBtn = el("shareBtn");
  const stopBtn = el("stopBtn");
  const leaveBtn = el("leaveBtn");
  const revokeControlBtn = el("revokeControlBtn");
  const shareBanner = el("shareBanner");
  const sharingIndicator = el("sharingIndicator");
  const controlActiveBanner = el("controlActiveBanner");
  const previewWrap = el("previewWrap");
  const preview = el("preview");

  const allowControlBtn = el("allowControlBtn");
  const denyControlBtn = el("denyControlBtn");

  const chatLog = el("chatLog");
  const chatForm = el("chatForm");
  const chatInput = el("chatInput");

  let ws = null;
  let stream = null;
  let frameTimer = null;
  let captureVideo = null;
  let captureCanvas = null;
  let captureCtx = null;
  let joinedSessionId = null;
  let reconnectAttempts = 0;
  let manuallyClosed = false;
  let controlActive = false;
  let socketReady = false;
  let screenSize = { width: window.screen.width, height: window.screen.height };
  let controlExecCount = 0;
  let controlExecWarned = false;

  function showOnly(card) {
    [joinCard, waitingCard, shareCard].forEach((c) => (c.style.display = "none"));
    controlApprovalCard.style.display = "none";
    card.style.display = "";
  }

  function setConnStatus(state, label) {
    connDot.className = "dot " + state;
    connLabel.textContent = label;
  }

  function showBanner(bannerEl, message, kind) {
    bannerEl.textContent = message;
    bannerEl.className = "banner show " + kind;
  }

  function hideBanner(bannerEl) {
    bannerEl.className = "banner";
  }

  function addChatLine(text, kind) {
    const div = document.createElement("div");
    div.className = "chat-msg " + kind;
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function teardownSocket() {
    if (ws) {
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch {
        /* ignore */
      }
      ws = null;
    }
  }

  function connectSocket() {
    const url = RTC?.wsUrl?.() ?? null;
    if (!url) {
      setConnStatus("down", "Not connected");
      showBanner(joinBanner, "Open this page at http://127.0.0.1:8080/client.html", "error");
      return;
    }

    teardownSocket();
    setConnStatus("warn", "Connecting…");
    socketReady = false;

    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      socketReady = true;
      setConnStatus("live", "Connected");
      if (joinedSessionId && shareCard.style.display !== "none") {
        send({ type: "resume-session", sessionId: joinedSessionId, role: "client" });
      } else {
        const params = new URLSearchParams(location.search);
        const fromUrl = params.get("session");
        if (fromUrl && joinCard.style.display !== "none") {
          codeInput.value = fromUrl.toUpperCase();
          attemptJoin();
        }
      }
    };

    ws.onclose = () => {
      socketReady = false;
      if (manuallyClosed) return;
      setConnStatus("down", "Disconnected");
      showBanner(joinBanner, "Lost connection to the server. Reconnecting…", "warn");
      scheduleReconnect();
    };

    ws.onerror = () => setConnStatus("warn", "Connection problem");

    ws.onmessage = ({ data }) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      handleServerMessage(msg);
    };
  }

  function scheduleReconnect() {
    reconnectAttempts += 1;
    const delay = Math.min(1000 * 2 ** reconnectAttempts, 15000);
    setTimeout(() => {
      if (!manuallyClosed && !socketReady) connectSocket();
    }, delay);
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  function attemptJoin() {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) return;
    hideBanner(joinBanner);
    joinedSessionId = code;
    send({ type: "join-session", sessionId: code });
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case "waiting-for-approval":
        showOnly(waitingCard);
        break;

      case "join-approved":
      case "session-resumed":
        showOnly(shareCard);
        if (sessionStatusPill) sessionStatusPill.style.display = "";
        break;

      case "join-denied":
        showBanner(joinBanner, "The technician declined the connection.", "error");
        joinedSessionId = null;
        showOnly(joinCard);
        break;

      case "chat":
        addChatLine(msg.text, "them");
        break;

      case "control-request":
        controlApprovalCard.style.display = "";
        break;

      case "control-event":
        if (controlActive && msg.event) {
          handleControlEvent(msg.event, msg.screenSize);
        }
        break;

      case "control-revoked":
        setControlActive(false);
        addChatLine("Remote control ended.", "system");
        break;

      case "session-ended":
        stopSharing();
        joinedSessionId = null;
        showBanner(joinBanner, describeEndReason(msg.reason), "info");
        showOnly(joinCard);
        break;

      case "error":
        showBanner(joinBanner, msg.message, "error");
        break;

      default:
        break;
    }
  }

  function describeEndReason(reason) {
    switch (reason) {
      case "host-disconnected":
        return "The technician disconnected. The session has ended.";
      case "ended-by-user":
        return "The session was ended.";
      default:
        return "The session ended.";
    }
  }

  function setControlActive(active) {
    controlActive = active;
    controlActiveBanner.style.display = active ? "block" : "none";
    revokeControlBtn.style.display = active ? "" : "none";
    if (active) {
      controlActiveBanner.className = "banner warn show";
      localAgentAvailable = null;
      controlExecWarned = false;
      controlExecCount = 0;
      probeLocalAgent(true);
    }
  }

  const LOCAL_CONTROL_URL = "http://127.0.0.1:9877/control";
  let localAgentAvailable = null;

  function resolveScreenSize(override) {
    if (override?.width > 0 && override?.height > 0) {
      return { width: override.width, height: override.height };
    }
    return screenSize;
  }

  async function probeLocalAgent(force) {
    if (!force && localAgentAvailable !== null) return localAgentAvailable;
    try {
      const res = await fetch("http://127.0.0.1:9877/health", {
        method: "GET",
        cache: "no-store",
      });
      localAgentAvailable = res.ok;
    } catch {
      localAgentAvailable = false;
    }
    return localAgentAvailable;
  }

  function warnControlNotExecuted() {
    if (controlExecWarned) return;
    controlExecWarned = true;
    addChatLine(
      "Remote control events received but could not drive this machine. " +
        "Install and run the desktop agent for mouse/keyboard control.",
      "system"
    );
  }

  async function handleControlEvent(event, overrideScreenSize) {
    const targetSize = resolveScreenSize(overrideScreenSize);
    let executed = false;

    if (window.__remoteSupportAgent?.handle) {
      window.__remoteSupportAgent.handle(event, targetSize);
      executed = true;
    } else if (await probeLocalAgent(false)) {
      try {
        const res = await fetch(LOCAL_CONTROL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event, screenSize: targetSize }),
        });
        executed = res.ok;
      } catch {
        executed = false;
      }
    }

    if (executed) {
      controlExecCount += 1;
      return;
    }

    if (event.kind === "mouse" && event.type === "mousedown") {
      warnControlNotExecuted();
    }
  }

  async function startSharing() {
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 12, max: 15 } },
        audio: false,
      });
    } catch (err) {
      showBanner(shareBanner, "Screen sharing was not started: " + err.message, "warn");
      return;
    }

    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();
    if (settings.width && settings.height) {
      screenSize = { width: settings.width, height: settings.height };
    }

    preview.srcObject = stream;
    previewWrap.style.display = "";
    shareBtn.style.display = "none";
    stopBtn.style.display = "";
    sharingIndicator.style.display = "flex";
    hideBanner(shareBanner);

    track.addEventListener("ended", stopSharing);

    captureVideo = document.createElement("video");
    captureVideo.srcObject = stream;
    captureVideo.muted = true;
    captureVideo.playsInline = true;
    await captureVideo.play();

    captureCanvas = document.createElement("canvas");
    captureCtx = captureCanvas.getContext("2d");

    send({ type: "stream-started" });

    const fps = 4;
    frameTimer = setInterval(() => {
      if (!captureVideo || captureVideo.readyState < 2) return;
      const srcW = captureVideo.videoWidth || screenSize.width;
      const srcH = captureVideo.videoHeight || screenSize.height;
      const size = RTC.scaledSize(srcW, srcH, 1280);
      captureCanvas.width = size.width;
      captureCanvas.height = size.height;
      captureCtx.drawImage(captureVideo, 0, 0, size.width, size.height);
      const dataUrl = captureCanvas.toDataURL("image/jpeg", 0.55);
      const base64 = dataUrl.split(",")[1];
      send({
        type: "frame",
        data: base64,
        width: size.width,
        height: size.height,
        ts: Date.now(),
      });
    }, 1000 / fps);
  }

  function stopSharing() {
    if (frameTimer) {
      clearInterval(frameTimer);
      frameTimer = null;
    }

    setControlActive(false);
    controlApprovalCard.style.display = "none";

    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    captureVideo = null;
    captureCanvas = null;
    captureCtx = null;
    preview.srcObject = null;
    previewWrap.style.display = "none";
    shareBtn.style.display = "";
    stopBtn.style.display = "none";
    sharingIndicator.style.display = "none";
    revokeControlBtn.style.display = "none";
    controlActiveBanner.style.display = "none";
  }

  function resetToJoin() {
    stopSharing();
    chatLog.innerHTML = "";
  }

  joinBtn.onclick = attemptJoin;
  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attemptJoin();
  });

  shareBtn.onclick = startSharing;
  stopBtn.onclick = stopSharing;

  leaveBtn.onclick = () => {
    send({ type: "end-session" });
    joinedSessionId = null;
    resetToJoin();
    showOnly(joinCard);
  };

  allowControlBtn.onclick = async () => {
    controlApprovalCard.style.display = "none";
    setControlActive(true);
    send({ type: "control-response", allowed: true });
    const hasAgent = await probeLocalAgent();
    addChatLine(
      hasAgent
        ? "You allowed remote control (via desktop agent)."
        : "You allowed remote control. Install the desktop agent for full mouse/keyboard control.",
      "system"
    );
  };

  denyControlBtn.onclick = () => {
    controlApprovalCard.style.display = "none";
    send({ type: "control-response", allowed: false });
    addChatLine("You declined remote control.", "system");
  };

  revokeControlBtn.onclick = () => {
    setControlActive(false);
    send({ type: "control-revoke" });
    addChatLine("You revoked remote control.", "system");
  };

  chatForm.onsubmit = (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    send({ type: "chat", text });
    addChatLine(text, "me");
    chatInput.value = "";
  };

  window.addEventListener("beforeunload", (e) => {
    manuallyClosed = true;
    if (stream) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  connectSocket();
})();