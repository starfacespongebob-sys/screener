(() => {
  "use strict";

  const el = (id) => document.getElementById(id);
  const RTC = window.RemoteSupportRtc;

  const connDot = el("connDot");
  const connLabel = el("connLabel");

  const setupView = el("setupView");
  const waitingView = el("waitingView");
  const sessionView = el("sessionView");

  const createBtn = el("createBtn");
  const createBtnMain = el("createBtnMain") || el("createBtnMainCard");
  const createBtnTop = el("createBtnTop");
  const setupBanner = el("setupBanner");
  const detailMachineTitle = el("detail-machine-title");
  const detailControlBtn = el("detailControlBtn");
  const detailScreenshotBtn = el("detailScreenshotBtn");
  const detailEndBtn = el("detailEndBtn");
  const detailJoinBtn = el("detailJoinBtn");

  const sessionCodeDisplay = el("sessionCodeDisplay");
  const expiresInEl = el("expiresIn");
  const copyLinkBtn = el("copyLinkBtn");
  const copyCodeBtn = el("copyCodeBtn");
  const cancelBtn = el("cancelBtn");

  const approvalOverlay = el("approvalOverlay");
  const approvalHint = el("approvalHint");
  const approveBtn = el("approveBtn");
  const denyBtn = el("denyBtn");

  const headerMeta = el("headerMeta");
  const headerCode = el("headerCode");
  const sessionTimerEl = el("sessionTimer");
  const clientDot = el("clientDot");
  const clientStatusLabel = el("clientStatusLabel");

  const sessionChipNone = el("sessionChipNone");
  const sessionChip = el("sessionChip");
  const chipCode = el("chipCode");
  const navMonitor = el("navMonitor");

  const videoWrap = el("videoWrap");
  const viewerStage = el("viewerStage");
  const video = el("video");
  const frameCanvas = el("frameCanvas");
  const frameCtx = frameCanvas ? frameCanvas.getContext("2d") : null;
  const videoPlaceholder = el("videoPlaceholder");

  const fitBtn = el("fitBtn");
  const actualBtn = el("actualBtn");
  const zoomInBtn = el("zoomInBtn");
  const zoomOutBtn = el("zoomOutBtn");
  const zoomLabel = el("zoomLabel");
  const screenshotBtn = el("screenshotBtn");
  const fullscreenBtn = el("fullscreenBtn");
  const controlBtn = el("controlBtn");
  const revokeControlBtn = el("revokeControlBtn");
  const endBtn = el("endBtn");

  const statResValue = el("statResValue");
  const statFpsValue = el("statFpsValue");
  const statLatencyValue = el("statLatencyValue");
  const statStreamValue = el("statStreamValue");
  const statControlValue = el("statControlValue");

  const chatLog = el("chatLog");
  const chatForm = el("chatForm");
  const chatInput = el("chatInput");

  const detailCode = el("detailCode");
  const detailClientType = el("detailClientType");
  const detailConnection = el("detailConnection");
  const detailDuration = el("detailDuration");
  const detailExpires = el("detailExpires");
  const detailCopyLink = el("detailCopyLink");
  const detailFrames = el("detailFrames");
  const detailAvgFps = el("detailAvgFps");
  const detailAvgLatency = el("detailAvgLatency");
  const detailLastFrame = el("detailLastFrame");
  const detailControl = el("detailControl");
  const qualityFill = el("qualityFill");
  const qualityLabel = el("qualityLabel");

  const toast = el("toast");
  const agentsTableBody = el("agentsTableBody");

  let ws = null;
  let registeredAgents = [];
  let selectedAgentId = null;
  let sessionId = null;
  let sessionExpiresAt = 0;
  let reconnectAttempts = 0;
  let manuallyClosed = false;
  let controlActive = false;
  let videoReady = false;
  let clientNative = false;
  let clientConnected = false;
  let streamSize = { width: 0, height: 0 };
  let sourceScreenSize = { width: 0, height: 0 };
  let socketReady = false;
  let lastMouseMoveSent = 0;
  let controlKeydownHandler = null;
  let controlKeyupHandler = null;
  let zoomLevel = 1;
  let viewMode = "fit";
  let sessionStartTime = null;
  let timerInterval = null;

  let frameCount = 0;
  let frameTimestamps = [];
  let latencySamples = [];
  let lastFrameAt = 0;

  const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

  function showView(view) {
    [setupView, waitingView, sessionView].forEach((v) => v.classList.add("hidden"));
    view.classList.remove("hidden");
  }

  function setCreateButtonsDisabled(disabled) {
    if (createBtn) createBtn.disabled = disabled;
    if (createBtnMain) createBtnMain.disabled = disabled;
    if (createBtnTop) createBtnTop.disabled = disabled;
  }

  function setConnStatus(state, label) {
    connDot.className = "dot " + state;
    connLabel.textContent = label;
  }

  function setClientStatus(state, label) {
    clientDot.className = state ? "dot " + state : "dot";
    clientStatusLabel.textContent = label;
  }

  function showBanner(bannerEl, message, kind) {
    bannerEl.textContent = message;
    bannerEl.className = "sc-banner show " + kind;
  }

  function hideBanner(bannerEl) {
    bannerEl.className = "sc-banner";
  }

  function showToast(message, kind = "info", ms = 3500) {
    toast.textContent = message;
    toast.className = "sc-toast show " + kind;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.className = "sc-toast";
    }, ms);
  }

  function addChatLine(text, kind) {
    const div = document.createElement("div");
    div.className = "sc-chat-msg " + kind;
    div.textContent = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function addSystemMessage(text) {
    addChatLine(text, "system");
  }

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
  }

  function startSessionTimer() {
    sessionStartTime = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (!sessionStartTime) return;
      const elapsed = formatDuration(Date.now() - sessionStartTime);
      sessionTimerEl.textContent = elapsed;
      detailDuration.textContent = elapsed;
      updateSessionsTable();
    }, 1000);
  }

  function stopSessionTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
    sessionStartTime = null;
    sessionTimerEl.textContent = "00:00:00";
  }

  function updateSessionChip(state) {
    if (!sessionId) {
      if (sessionChip) sessionChip.style.display = "none";
      if (sessionChipNone) sessionChipNone.style.display = "";
      return;
    }
    if (sessionChipNone) sessionChipNone.style.display = "none";
    if (sessionChip) {
      sessionChip.style.display = "";
      chipCode.textContent = sessionId;
      sessionChip.className = "group-item sc-session-chip " + (state || "waiting");
    }
  }

  function formatLastSeen(ts) {
    if (!ts) return "—";
    const ago = Math.round((Date.now() - ts) / 1000);
    if (ago < 10) return "Active now";
    if (ago < 60) return ago + "s ago";
    if (ago < 3600) return Math.round(ago / 60) + "m ago";
    return Math.round(ago / 3600) + "h ago";
  }

  function selectAgent(machineId) {
    selectedAgentId = machineId;
    const agent = registeredAgents.find((a) => a.machineId === machineId);
    renderAgentsTable();
    if (!agent) {
      if (detailJoinBtn) detailJoinBtn.disabled = true;
      return;
    }
    if (detailMachineTitle) detailMachineTitle.textContent = agent.hostname || machineId;
    if (detailCode) detailCode.textContent = machineId.slice(0, 12) + "…";
    if (detailClientType) detailClientType.textContent = "Native Agent (" + (agent.os || "Desktop") + ")";
    if (detailConnection) {
      detailConnection.textContent = agent.inSession ? "In session" : "Online";
      detailConnection.className = "sc-detail-value live";
    }
    if (detailJoinBtn) detailJoinBtn.disabled = agent.inSession || Boolean(sessionId);
    if (detailEndBtn) detailEndBtn.disabled = !sessionId;
  }

  function renderAgentsTable() {
    if (!agentsTableBody) return;
    if (!registeredAgents.length) {
      agentsTableBody.innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No endpoints online — install the native agent on client machines</td></tr>';
      return;
    }
    agentsTableBody.innerHTML = registeredAgents
      .map((a) => {
        const online = !a.inSession;
        const statusClass = a.inSession ? "status-waiting" : "status-online";
        const statusLabel = a.inSession ? "Busy" : "Online";
        const selected = a.machineId === selectedAgentId ? " selected" : "";
        return `<tr class="agent-row${selected}" data-id="${a.machineId}">
          <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
          <td><strong>${a.hostname || "Unknown"}</strong></td>
          <td>${a.os || "—"}</td>
          <td>${a.user || "—"}</td>
          <td>${formatLastSeen(a.lastSeen)}</td>
          <td style="font-family:monospace;font-size:11px">${a.machineId.slice(0, 8)}…</td>
        </tr>`;
      })
      .join("");

    agentsTableBody.querySelectorAll(".agent-row").forEach((row) => {
      row.onclick = () => selectAgent(row.dataset.id);
    });

    const onlineCount = registeredAgents.filter((a) => !a.inSession).length;
    const groupCount = document.querySelector(".group-tree .group-item .group-count");
    if (groupCount && groupCount.parentElement?.textContent?.includes("All Endpoints")) {
      groupCount.textContent = String(onlineCount);
    }
  }

  function connectToAgent() {
    if (!selectedAgentId) {
      showToast("Select an endpoint from the table first.", "warn");
      return;
    }
    if (!send({ type: "connect-agent", machineId: selectedAgentId })) return;
    showToast("Connecting to endpoint…", "info");
    if (detailJoinBtn) detailJoinBtn.disabled = true;
  }

  function updateSessionsTable() {
    const tbody = agentsTableBody;
    if (!tbody || !sessionId) return;
    const statusClass = clientConnected ? "status-online" : "status-waiting";
    const statusLabel = clientConnected ? "Online" : "Waiting";
    const clientType = clientConnected
      ? (clientNative ? "Desktop Agent" : "Browser Client")
      : "—";
    const stream = videoReady ? "Live" : clientConnected ? "Connecting" : "—";
    const control = controlActive ? "Active" : "Off";
    const duration = sessionStartTime ? formatDuration(Date.now() - sessionStartTime) : "—";
    tbody.innerHTML = `
      <tr>
        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        <td><strong>${sessionId}</strong></td>
        <td>${clientType}</td>
        <td>${duration}</td>
        <td>${stream}</td>
        <td>${control}</td>
      </tr>`;
  }

  function updateSessionDetails() {
    detailCode.textContent = sessionId || "—";
    headerCode.textContent = sessionId || "--------";
    if (detailMachineTitle) {
      detailMachineTitle.textContent = sessionId
        ? (clientConnected ? `Session ${sessionId}` : `Session ${sessionId} (waiting)`)
        : "Session Details";
    }
    const panelEnabled = Boolean(sessionId && clientConnected);
    const streamEnabled = Boolean(videoReady);
    if (detailJoinBtn) detailJoinBtn.disabled = !panelEnabled;
    if (detailControlBtn) detailControlBtn.disabled = !streamEnabled || controlActive;
    if (detailScreenshotBtn) detailScreenshotBtn.disabled = !streamEnabled;
    if (detailEndBtn) detailEndBtn.disabled = !sessionId;
    detailClientType.textContent = !clientConnected
      ? "—"
      : clientNative
        ? "Desktop Agent"
        : "Browser Client";
    detailConnection.textContent = !clientConnected
      ? "Waiting"
      : videoReady
        ? "Streaming"
        : "Connected";
    detailConnection.className = "sc-detail-value " + (videoReady ? "live" : clientConnected ? "warn" : "");
    if (sessionExpiresAt) {
      const mins = Math.max(0, Math.ceil((sessionExpiresAt - Date.now()) / 60000));
      detailExpires.textContent = mins + " min remaining";
    } else {
      detailExpires.textContent = "—";
    }
  }

  function setStreamStatus(label, kind) {
    statStreamValue.textContent = label;
    const stat = el("statStream");
    stat.className = "stat" + (kind ? " " + kind : "");
  }

  function updateMonitorStats() {
    detailFrames.textContent = String(frameCount);

    const now = Date.now();
    frameTimestamps = frameTimestamps.filter((t) => now - t < 10000);
    const fps = frameTimestamps.length / 10;
    detailAvgFps.textContent = frameTimestamps.length ? fps.toFixed(1) : "—";
    statFpsValue.textContent = frameTimestamps.length ? fps.toFixed(1) : "—";

    latencySamples = latencySamples.filter((s) => now - s.at < 10000);
    if (latencySamples.length) {
      const avg = latencySamples.reduce((a, s) => a + s.ms, 0) / latencySamples.length;
      detailAvgLatency.textContent = Math.round(avg) + " ms";
      statLatencyValue.textContent = Math.round(avg) + " ms";
    } else {
      detailAvgLatency.textContent = "—";
      statLatencyValue.textContent = "—";
    }

    if (lastFrameAt) {
      const ago = Math.round((now - lastFrameAt) / 1000);
      detailLastFrame.textContent = ago < 2 ? "Just now" : ago + "s ago";
    } else {
      detailLastFrame.textContent = "—";
    }

    let quality = 0;
    if (frameTimestamps.length >= 2) {
      quality = Math.min(100, Math.round((fps / 4) * 100));
      if (avgLatencyOk()) quality = Math.min(quality, latencyQuality());
    }
    qualityFill.style.width = quality + "%";
    qualityFill.className = "sc-quality-meter-fill" + (quality < 40 ? " low" : quality < 70 ? " mid" : "");
    qualityLabel.textContent = videoReady
      ? quality >= 70
        ? "Good stream quality"
        : quality >= 40
          ? "Moderate stream quality"
          : "Poor stream quality"
      : "No stream data";
  }

  function avgLatencyOk() {
    return latencySamples.length > 0;
  }

  function latencyQuality() {
    const avg = latencySamples.reduce((a, s) => a + s.ms, 0) / latencySamples.length;
    if (avg < 200) return 100;
    if (avg < 500) return 70;
    if (avg < 1000) return 40;
    return 20;
  }

  setInterval(updateMonitorStats, 1000);

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
      setSocketReady(false);
      showBanner(
        setupBanner,
        "Open this page at http://127.0.0.1:8080/viewer.html (not as a local file).",
        "error"
      );
      return;
    }

    teardownSocket();
    setConnStatus("warn", "Connecting…");
    setSocketReady(false);

    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      setConnStatus("live", "Server connected");
      setSocketReady(true);
      hideBanner(setupBanner);
      send({ type: "subscribe-agents" });
      if (sessionId && !sessionView.classList.contains("hidden")) {
        send({ type: "resume-session", sessionId, role: "host" });
      }
    };

    ws.onclose = () => {
      setSocketReady(false);
      if (manuallyClosed) return;
      setConnStatus("down", "Disconnected");
      showToast("Lost connection to server. Reconnecting…", "warn", 5000);
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

  function setSocketReady(ready) {
    socketReady = ready;
    setCreateButtonsDisabled(!ready);
  }

  function send(obj) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    showToast("Not connected to server. Wait for Connected status.", "warn");
    return false;
  }

  function applyZoom() {
    if (!frameCanvas || frameCanvas.style.display === "none") return;
    const idx = ZOOM_STEPS.indexOf(zoomLevel);
    zoomInBtn.disabled = idx >= ZOOM_STEPS.length - 1;
    zoomOutBtn.disabled = idx <= 0;
    zoomLabel.textContent = Math.round(zoomLevel * 100) + "%";

    if (viewMode === "actual" || viewMode === "zoom") {
      videoWrap.classList.remove("fit", "actual");
      const w = streamSize.width * zoomLevel;
      const h = streamSize.height * zoomLevel;
      frameCanvas.style.width = w ? w + "px" : "auto";
      frameCanvas.style.height = h ? h + "px" : "auto";
      frameCanvas.style.maxWidth = "none";
      frameCanvas.style.maxHeight = "none";
    }
  }

  function setViewMode(mode) {
    viewMode = mode;
    videoWrap.classList.remove("fit", "actual");
    fitBtn.classList.remove("active");
    actualBtn.classList.remove("active");

    if (mode === "fit") {
      videoWrap.classList.add("fit");
      fitBtn.classList.add("active");
      if (frameCanvas) {
        frameCanvas.style.width = "";
        frameCanvas.style.height = "";
      }
      zoomInBtn.disabled = true;
      zoomOutBtn.disabled = true;
      zoomLabel.textContent = "Fit";
    } else {
      videoWrap.classList.add("actual");
      actualBtn.classList.add("active");
      if (zoomLevel === 1 && mode === "actual") {
        zoomInBtn.disabled = false;
        zoomOutBtn.disabled = false;
        zoomLabel.textContent = "100%";
      }
      applyZoom();
    }
  }

  function enableViewerTools(enabled) {
    screenshotBtn.disabled = !enabled;
    fullscreenBtn.disabled = !enabled;
    controlBtn.disabled = !enabled;
    zoomInBtn.disabled = !enabled || viewMode === "fit";
    zoomOutBtn.disabled = !enabled || viewMode === "fit";
    navMonitor.disabled = !sessionId;
  }

  function showStreamView() {
    video.style.display = "none";
    if (frameCanvas) frameCanvas.style.display = "block";
    videoPlaceholder.classList.add("hidden");
    videoReady = true;
    controlBtn.disabled = false;
    enableViewerTools(true);
    setStreamStatus("Live", "live");
    if (streamSize.width) {
      statResValue.textContent = streamSize.width + " × " + streamSize.height;
    }
    updateSessionDetails();
  }

  function renderFrame(msg) {
    if (!msg.data || !frameCanvas || !frameCtx) return;

    const now = Date.now();
    frameCount += 1;
    frameTimestamps.push(now);
    lastFrameAt = now;

    if (msg.ts) {
      latencySamples.push({ ms: Math.max(0, now - msg.ts), at: now });
    }

    if (msg.width && msg.height) {
      sourceScreenSize = { width: msg.width, height: msg.height };
    }

    const img = new Image();
    img.onload = () => {
      if (frameCanvas.width !== img.width || frameCanvas.height !== img.height) {
        frameCanvas.width = img.width;
        frameCanvas.height = img.height;
      }
      streamSize = { width: img.width, height: img.height };
      frameCtx.drawImage(img, 0, 0);
      showStreamView();
      applyZoom();
      updateSessionsTable();
    };
    img.onerror = () => showToast("Received a corrupt video frame.", "warn");
    img.src = "data:image/jpeg;base64," + msg.data;
  }

  function handleServerMessage(msg) {
    switch (msg.type) {
      case "agent-list":
        registeredAgents = msg.agents || [];
        renderAgentsTable();
        if (selectedAgentId) selectAgent(selectedAgentId);
        break;

      case "session-created":
        sessionId = msg.sessionId;
        sessionExpiresAt = Date.now() + msg.expiresInMs;
        sessionCodeDisplay.textContent = sessionId;
        headerCode.textContent = sessionId;
        expiresInEl.textContent = Math.round(msg.expiresInMs / 60000);
        updateSessionChip("waiting");
        if (headerMeta) headerMeta.style.display = "flex";
        updateSessionDetails();
        addSystemMessage("Session " + sessionId + " created.");
        if (msg.unattended) {
          showView(sessionView);
        } else {
          updateSessionsTable();
          showView(waitingView);
        }
        break;

      case "session-resumed":
        if (headerMeta) headerMeta.style.display = "flex";
        if (clientConnected) showView(sessionView);
        else if (sessionId) showView(waitingView);
        break;

      case "client-waiting": {
        approvalHint.textContent = msg.native
          ? `${msg.agentName || "Desktop agent"} is requesting access. Only approve if you are expecting them.`
          : "A browser guest entered your session code. Only approve if you are expecting them.";
        approvalOverlay.classList.add("show");
        setClientStatus("warn", "Awaiting approval");
        addSystemMessage("Guest waiting for approval.");
        break;
      }

      case "client-approved":
        clientNative = Boolean(msg.native);
        clientConnected = true;
        approvalOverlay.classList.remove("show");
        updateSessionChip("live");
        setClientStatus("live", msg.hostname || (clientNative ? "Agent connected" : "Client connected"));
        showView(sessionView);
        startSessionTimer();
        setStreamStatus("Connecting", "warn");
        enableViewerTools(false);
        controlBtn.disabled = true;
        addSystemMessage(
          (msg.hostname || (clientNative ? "Desktop agent" : "Browser client")) + " connected."
        );
        updateSessionDetails();
        updateSessionsTable();
        if (clientNative && msg.machineId) selectedAgentId = msg.machineId;
        break;

      case "client-reconnected":
        clientConnected = true;
        setClientStatus("live", "Reconnected");
        showToast("Guest reconnected to the session.", "success");
        addSystemMessage("Guest reconnected.");
        updateSessionDetails();
        updateSessionsTable();
        break;

      case "native-stream-started":
      case "stream-started":
        setStreamStatus("Live", "live");
        addSystemMessage("Screen sharing started.");
        updateSessionDetails();
        break;

      case "frame":
        renderFrame(msg);
        break;

      case "chat":
        addChatLine(msg.text, "them");
        break;

      case "control-response":
        if (msg.allowed) {
          enableControl(msg.preApproved);
        } else {
          showToast("The guest declined remote control.", "warn");
          addSystemMessage("Remote control request denied.");
        }
        break;

      case "control-revoked":
        disableControl();
        showToast("Remote control was revoked.", "info");
        addSystemMessage("Remote control revoked.");
        break;

      case "client-left":
        clientConnected = false;
        videoReady = false;
        setClientStatus("warn", "Disconnected");
        setStreamStatus("Disconnected", "warn");
        resetStreamView();
        showToast("Guest disconnected. Waiting for rejoin…", "warn", 5000);
        addSystemMessage("Guest disconnected.");
        updateSessionDetails();
        break;

      case "session-ended":
        showToast(describeEndReason(msg.reason), "info", 5000);
        resetToSetup();
        break;

      case "error":
        showToast(msg.message, "warn");
        break;

      default:
        break;
    }
  }

  function describeEndReason(reason) {
    switch (reason) {
      case "expired":
        return "Session code expired before anyone joined.";
      case "ended-by-user":
        return "Session ended.";
      default:
        return "Session ended.";
    }
  }

  function getControlScreenSize() {
    return {
      width: sourceScreenSize.width || streamSize.width || 1920,
      height: sourceScreenSize.height || streamSize.height || 1080,
    };
  }

  function bindControlKeyboard() {
    unbindControlKeyboard();
    controlKeydownHandler = (e) => {
      if (!controlActive) return;
      if (e.target === chatInput || e.target?.closest?.(".sc-chat-input")) return;
      if (["F5", "F11", "F12"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      sendControlEvent({
        kind: "key",
        type: "keydown",
        key: e.key,
        code: e.code,
      });
    };
    controlKeyupHandler = (e) => {
      if (!controlActive) return;
      if (e.target === chatInput || e.target?.closest?.(".sc-chat-input")) return;
      e.preventDefault();
      e.stopPropagation();
      sendControlEvent({
        kind: "key",
        type: "keyup",
        key: e.key,
        code: e.code,
      });
    };
    document.addEventListener("keydown", controlKeydownHandler, true);
    document.addEventListener("keyup", controlKeyupHandler, true);
  }

  function unbindControlKeyboard() {
    if (controlKeydownHandler) {
      document.removeEventListener("keydown", controlKeydownHandler, true);
      controlKeydownHandler = null;
    }
    if (controlKeyupHandler) {
      document.removeEventListener("keyup", controlKeyupHandler, true);
      controlKeyupHandler = null;
    }
  }

  function enableControl(preApproved) {
    controlActive = true;
    controlBtn.style.display = "none";
    revokeControlBtn.style.display = "";
    videoWrap.classList.add("control-active");
    if (frameCanvas) frameCanvas.classList.add("control-surface");
    statControlValue.textContent = "Active";
    detailControl.textContent = "Active";
    detailControl.className = "sc-detail-value live";
    if (detailControlBtn) detailControlBtn.disabled = true;
    videoWrap.setAttribute("tabindex", "0");
    if (frameCanvas) frameCanvas.setAttribute("tabindex", "-1");
    bindControlKeyboard();
    videoWrap.focus();
    const hint = preApproved
      ? "Remote control ready. Click the remote screen, then type."
      : "Remote control active. Click the remote screen, then type.";
    showToast(hint, "success");
    addSystemMessage(preApproved ? "Remote control pre-approved for endpoint." : "Remote control enabled.");
    updateSessionDetails();
    updateSessionsTable();
  }

  function disableControl() {
    controlActive = false;
    unbindControlKeyboard();
    controlBtn.style.display = "";
    controlBtn.disabled = !videoReady;
    revokeControlBtn.style.display = "none";
    videoWrap.classList.remove("control-active");
    if (frameCanvas) frameCanvas.classList.remove("control-surface");
    videoWrap.removeAttribute("tabindex");
    if (frameCanvas) frameCanvas.removeAttribute("tabindex");
    statControlValue.textContent = "Off";
    detailControl.textContent = "Inactive";
    detailControl.className = "sc-detail-value";
    if (detailControlBtn) detailControlBtn.disabled = !videoReady;
    updateSessionDetails();
  }

  function resetStreamView() {
    video.style.display = "none";
    if (frameCanvas) frameCanvas.style.display = "none";
    videoPlaceholder.classList.remove("hidden");
    videoReady = false;
    streamSize = { width: 0, height: 0 };
    sourceScreenSize = { width: 0, height: 0 };
    controlBtn.disabled = true;
    enableViewerTools(false);
    statResValue.textContent = "—";
    statFpsValue.textContent = "—";
    statLatencyValue.textContent = "—";
    frameCount = 0;
    frameTimestamps = [];
    latencySamples = [];
    lastFrameAt = 0;
    qualityFill.style.width = "0%";
    qualityLabel.textContent = "No stream data";
  }

  function sendControlEvent(event) {
    if (!controlActive) return false;
    if (!canSendControl() && event.kind === "mouse") return false;
    return send({
      type: "control-event",
      event,
      screenSize: getControlScreenSize(),
    });
  }

  function controlCoords(e) {
    const rect = frameCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function canSendControl() {
    if (!controlActive || !frameCanvas) return false;
    if (frameCanvas.style.display === "none") return false;
    const rect = frameCanvas.getBoundingClientRect();
    return rect.width > 2 && rect.height > 2;
  }

  function sendMouseEvent(e, type) {
    const coords = controlCoords(e);
    if (!coords) return;
    const button = e.button ?? 0;
    sendControlEvent({
      kind: "mouse",
      type,
      x: coords.x,
      y: coords.y,
      button,
    });
  }

  function bindScreenControl() {
    const surface = frameCanvas || videoWrap;

    surface.addEventListener(
      "pointerdown",
      (e) => {
        if (!controlActive) return;
        if (!canSendControl()) {
          showToast("Waiting for the video stream before sending input.", "warn", 2000);
          return;
        }
        e.preventDefault();
        try {
          surface.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        videoWrap.focus();
        if (e.button === 2) {
          sendMouseEvent(e, "mousedown");
          sendMouseEvent(e, "mouseup");
          return;
        }
        sendMouseEvent(e, "mousedown");
      },
      true
    );

    surface.addEventListener(
      "pointerup",
      (e) => {
        if (!controlActive || !canSendControl()) return;
        e.preventDefault();
        sendMouseEvent(e, "mouseup");
        try {
          surface.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      },
      true
    );

    surface.addEventListener(
      "pointermove",
      (e) => {
        if (!controlActive || !canSendControl()) return;
        if (e.buttons === 0) return;
        const now = Date.now();
        if (now - lastMouseMoveSent < 33) return;
        lastMouseMoveSent = now;
        sendMouseEvent(e, "mousemove");
      },
      true
    );

    surface.addEventListener(
      "contextmenu",
      (e) => {
        if (!controlActive) return;
        e.preventDefault();
      },
      true
    );

    videoWrap.addEventListener(
      "wheel",
      (e) => {
        if (!controlActive || !canSendControl()) return;
        e.preventDefault();
        sendControlEvent({ kind: "wheel", deltaX: e.deltaX, deltaY: e.deltaY });
      },
      { passive: false, capture: true }
    );
  }

  function resetToSetup() {
    resetStreamView();
    disableControl();
    sessionId = null;
    sessionExpiresAt = 0;
    clientNative = false;
    clientConnected = false;
    chatLog.innerHTML = "";
    approvalOverlay.classList.remove("show");
    headerMeta.style.display = "none";
    stopSessionTimer();
    updateSessionChip(null);
    setClientStatus("", "No client");
    clientDot.className = "dot";
    setStreamStatus("Idle");
    navMonitor.disabled = true;
    enableViewerTools(false);
    updateSessionDetails();
    selectedAgentId = null;
    if (detailJoinBtn) detailJoinBtn.disabled = false;
    showView(setupView);
    send({ type: "subscribe-agents" });
  }

  function createSession() {
    hideBanner(setupBanner);
    if (!send({ type: "create-session" })) return;
    setCreateButtonsDisabled(true);
    setTimeout(() => {
      if (socketReady && !sessionId) setCreateButtonsDisabled(false);
    }, 3000);
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label + " copied to clipboard.", "success", 2000);
    } catch {
      window.prompt("Copy this:", text);
    }
  }

  function takeScreenshot() {
    if (!frameCanvas || frameCanvas.style.display === "none") return;
    const link = document.createElement("a");
    link.download = `remote-console-${sessionId || "capture"}-${Date.now()}.png`;
    link.href = frameCanvas.toDataURL("image/png");
    link.click();
    showToast("Screenshot saved.", "success", 2000);
  }

  function toggleFullscreen() {
    const target = viewerStage;
    if (!document.fullscreenElement) {
      target.requestFullscreen?.().catch(() => showToast("Fullscreen not available.", "warn"));
    } else {
      document.exitFullscreen?.();
    }
  }

  function bindTabs() {
    document.querySelectorAll(".sc-tab").forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll(".sc-tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".sc-tab-panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        const panel = el("tab" + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1));
        if (panel) panel.classList.add("active");
      };
    });
  }

  if (createBtn) createBtn.onclick = createSession;
  if (createBtnMain) createBtnMain.onclick = createSession;
  if (createBtnTop) createBtnTop.onclick = createSession;

  if (detailControlBtn) detailControlBtn.onclick = () => controlBtn.click();
  if (detailScreenshotBtn) detailScreenshotBtn.onclick = () => screenshotBtn.click();
  if (detailEndBtn) detailEndBtn.onclick = () => endBtn.click();
  if (detailJoinBtn) {
    detailJoinBtn.onclick = () => {
      if (sessionId && clientConnected) {
        showView(sessionView);
        return;
      }
      connectToAgent();
    };
  }

  copyLinkBtn.onclick = () => {
    copyText(`${location.origin}/client.html?session=${sessionId}`, "Client link");
  };

  copyCodeBtn.onclick = () => copyText(sessionId, "Session code");

  detailCopyLink.onclick = () => {
    if (sessionId) copyText(`${location.origin}/client.html?session=${sessionId}`, "Client link");
  };

  cancelBtn.onclick = () => {
    send({ type: "end-session" });
    resetToSetup();
  };

  approveBtn.onclick = () => {
    send({ type: "approve-client" });
    approvalOverlay.classList.remove("show");
  };

  denyBtn.onclick = () => {
    send({ type: "deny-client" });
    approvalOverlay.classList.remove("show");
    addSystemMessage("Connection denied.");
  };

  controlBtn.onclick = () => {
    send({ type: "control-request" });
    showToast("Requesting remote control…", "info");
  };

  revokeControlBtn.onclick = () => {
    send({ type: "control-revoke" });
    disableControl();
  };

  endBtn.onclick = () => {
    if (confirm("End this support session?")) {
      send({ type: "end-session" });
      resetToSetup();
    }
  };

  fitBtn.onclick = () => setViewMode("fit");
  actualBtn.onclick = () => {
    zoomLevel = 1;
    setViewMode("actual");
  };

  zoomInBtn.onclick = () => {
    const idx = ZOOM_STEPS.indexOf(zoomLevel);
    if (idx < ZOOM_STEPS.length - 1) {
      zoomLevel = ZOOM_STEPS[idx + 1];
      viewMode = "zoom";
      applyZoom();
    }
  };

  zoomOutBtn.onclick = () => {
    const idx = ZOOM_STEPS.indexOf(zoomLevel);
    if (idx > 0) {
      zoomLevel = ZOOM_STEPS[idx - 1];
      viewMode = "zoom";
      applyZoom();
    }
  };

  screenshotBtn.onclick = takeScreenshot;
  fullscreenBtn.onclick = toggleFullscreen;

  chatForm.onsubmit = (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    send({ type: "chat", text });
    addChatLine(text, "me");
    chatInput.value = "";
  };

  document.addEventListener("fullscreenchange", () => {
    viewerStage.classList.toggle("fullscreen", Boolean(document.fullscreenElement));
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") {
      if (!sessionView.classList.contains("hidden") && videoReady) toggleFullscreen();
    }
  });

  navMonitor.onclick = () => {
    document.querySelectorAll(".sc-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".sc-tab-panel").forEach((p) => p.classList.remove("active"));
    document.querySelector('.sc-tab[data-tab="monitor"]').classList.add("active");
    el("tabMonitor").classList.add("active");
  };

  window.addEventListener("beforeunload", () => {
    manuallyClosed = true;
  });

  bindScreenControl();
  bindTabs();
  setViewMode("fit");
  connectSocket();
})();