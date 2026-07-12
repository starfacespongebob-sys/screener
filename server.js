require("dotenv").config();

const express = require("express");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const WebSocket = require("ws");

const PORT = parseInt(process.env.PORT, 10) || 8080;
const USE_TLS = process.env.USE_TLS === "true";
const SESSION_TTL_MS =
  (parseInt(process.env.SESSION_TTL_MINUTES, 10) || 30) * 60 * 1000;
const MAX_SIGNAL_BYTES = 64 * 1024;
const MAX_FRAME_BYTES = 4 * 1024 * 1024;
const HEARTBEAT_MS = 30000;

const app = express();

app.use(
  helmet({
    // Local HTTP dev: HSTS + upgrade-insecure-requests break ws:// on localhost.
    strictTransportSecurity: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: [
          "'self'",
          "ws:",
          "wss:",
          "http://127.0.0.1:9877",
        ],
        imgSrc: ["'self'", "data:", "blob:"],
        mediaSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  })
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const PUBLIC_DIR = path.join(__dirname, "public");
const BUILD_VERSION = process.env.BUILD_VERSION || "2026.07.06-v12";

app.use((req, res, next) => {
  if (req.path.endsWith(".html")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  } else if (/\.(js|css)$/.test(req.path)) {
    res.setHeader("Cache-Control", "public, max-age=3600, must-revalidate");
  }
  next();
});

function serveDownloadsIndex(req, res) {
  const indexPath = path.join(PUBLIC_DIR, "downloads", "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return res.status(404).send("Downloads index not found.");
}

app.get(["/downloads", "/downloads/"], serveDownloadsIndex);

app.use(
  express.static(PUBLIC_DIR, {
    etag: true,
    lastModified: true,
    index: false,
  })
);

app.get("/ice-servers", (req, res) => {
  const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];

  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  res.json({ iceServers });
});

app.get("/healthz", (req, res) => res.status(200).send("ok"));

app.get("/api/version", (req, res) => {
  res.json({
    build: BUILD_VERSION,
    viewer: "smart-connect",
    agentsOnline: agents.size,
    files: {
      viewerHtml: fs.existsSync(path.join(PUBLIC_DIR, "viewer.html")),
      viewerCss: fs.existsSync(path.join(PUBLIC_DIR, "viewer.css")),
      viewerJs: fs.existsSync(path.join(PUBLIC_DIR, "viewer.js")),
      rtcUtils: fs.existsSync(path.join(PUBLIC_DIR, "rtc-utils.js")),
    },
  });
});

app.get("/api/agents", (req, res) => {
  res.json({
    agents: [...agents.values()].map(agentSnapshot),
  });
});

app.get("/", (req, res) => res.redirect("/viewer.html"));

let server;
if (USE_TLS) {
  server = https.createServer(
    {
      key: fs.readFileSync(process.env.TLS_KEY_PATH),
      cert: fs.readFileSync(process.env.TLS_CERT_PATH),
    },
    app
  );
} else {
  server = http.createServer(app);
}

const wss = new WebSocket.Server({
  server,
  maxPayload: MAX_FRAME_BYTES,
});

const sessions = new Map();
const agents = new Map();
const agentSubscribers = new Set();
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateSessionId() {
  let id;
  do {
    id = "";
    for (let i = 0; i < 8; i++) {
      id += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    }
  } while (sessions.has(id));
  return id;
}

function safeSend(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function agentSnapshot(record) {
  return {
    machineId: record.machineId,
    hostname: record.hostname,
    os: record.os,
    platform: record.platform,
    user: record.user,
    version: record.version,
    inSession: Boolean(record.ws?.sessionId),
    lastSeen: record.lastSeen,
  };
}

function broadcastAgentList() {
  const list = [...agents.values()].map(agentSnapshot);
  agentSubscribers.forEach((hostWs) => {
    safeSend(hostWs, { type: "agent-list", agents: list });
  });
}

function releaseAgentSession(agentWs, notifyHost) {
  if (!agentWs?.machineId) return;
  const record = agents.get(agentWs.machineId);
  if (record) record.inSession = false;
  const sessionId = agentWs.sessionId;
  agentWs.sessionId = null;
  if (!sessionId) return;
  const session = sessions.get(sessionId);
  if (!session) return;
  if (session.client === agentWs) {
    session.client = null;
    session.clientNative = false;
    if (notifyHost && session.host) {
      safeSend(session.host, { type: "client-left" });
    }
  }
}

function teardownSession(sessionId, reason) {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (session.client?.role === "agent") {
    safeSend(session.client, { type: "session-ended", reason });
    releaseAgentSession(session.client, false);
  } else {
    [session.client, session.pending].forEach((peer) => {
      if (peer) {
        safeSend(peer, { type: "session-ended", reason });
        peer.sessionId = null;
        peer.close();
      }
    });
  }

  if (session.host) {
    safeSend(session.host, { type: "session-ended", reason });
    session.host.sessionId = null;
  }

  sessions.delete(sessionId);
  broadcastAgentList();
}

function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) {
      teardownSession(id, "expired");
    }
  }
}
setInterval(cleanupExpiredSessions, 60 * 1000);

const connectionCounts = new Map();
const CONNECTIONS_PER_IP_PER_MINUTE = 30;

setInterval(() => connectionCounts.clear(), 60 * 1000);

wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress || "unknown";
  const count = (connectionCounts.get(ip) || 0) + 1;
  connectionCounts.set(ip, count);

  if (count > CONNECTIONS_PER_IP_PER_MINUTE) {
    ws.close(1008, "Rate limit exceeded");
    return;
  }

  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (raw) => {
    ws.isAlive = true;

    if (Buffer.isBuffer(raw)) {
      raw = raw.toString("utf8");
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    if (!data || typeof data.type !== "string") return;

    if (data.type === "frame" && raw.length > MAX_FRAME_BYTES) {
      return;
    }
    if (data.type !== "frame" && raw.length > MAX_SIGNAL_BYTES) {
      return;
    }

    try {
      handleMessage(ws, data);
    } catch (err) {
      console.error("Error handling message:", err);
    }
  });

  ws.on("close", () => handleClose(ws));
});

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, HEARTBEAT_MS);

wss.on("close", () => clearInterval(heartbeatInterval));

function handleMessage(ws, data) {
  switch (data.type) {
    case "create-session":
      return createSession(ws);
    case "join-session":
      return joinSession(ws, data, false);
    case "join-session-native":
      return joinSession(ws, data, true);
    case "approve-client":
      return approveClient(ws);
    case "deny-client":
      return denyClient(ws);
    case "signal":
      return relaySignal(ws, data);
    case "frame":
      return relayFrame(ws, data);
    case "stream-started":
      return notifyStreamStarted(ws);
    case "chat":
      return relayChat(ws, data);
    case "control-request":
      return relayControlRequest(ws);
    case "control-response":
      return relayControlResponse(ws, data);
    case "control-revoke":
      return relayControlRevoke(ws);
    case "control-event":
      return relayControlEvent(ws, data);
    case "resume-session":
      return resumeSession(ws, data);
    case "end-session":
      return endSessionByUser(ws);
    case "register-agent":
      return registerAgent(ws, data);
    case "agent-heartbeat":
      return refreshAgentHeartbeat(ws, data);
    case "subscribe-agents":
      return subscribeAgents(ws);
    case "connect-agent":
      return connectAgent(ws, data);
    default:
      return;
  }
}

function registerAgent(ws, data) {
  const machineId = String(data.machineId || "").trim();
  if (!machineId || machineId.length < 8) {
    console.warn("register-agent rejected: invalid machineId", machineId);
    return safeSend(ws, { type: "error", message: "Invalid machine ID." });
  }

  console.log(
    `register-agent: ${machineId.slice(0, 8)}… host=${data.hostname || "?"} os=${data.os || "?"} v=${data.version || "?"}`
  );

  const existing = agents.get(machineId);
  if (existing?.ws && existing.ws !== ws) {
    try {
      existing.ws.close();
    } catch {
      /* ignore */
    }
  }

  ws.role = "agent";
  ws.machineId = machineId;
  ws.isNative = true;
  ws.sessionId = null;

  agents.set(machineId, {
    machineId,
    ws,
    hostname: String(data.hostname || data.agentName || "Unknown").slice(0, 128),
    os: String(data.os || "Unknown").slice(0, 128),
    platform: String(data.platform || "").slice(0, 64),
    user: String(data.user || "—").slice(0, 64),
    version: String(data.version || "1.0").slice(0, 32),
    lastSeen: Date.now(),
    inSession: false,
  });

  safeSend(ws, { type: "agent-registered", machineId });
  broadcastAgentList();
}

function refreshAgentHeartbeat(ws, data) {
  const machineId = String(data.machineId || ws.machineId || "").trim();
  if (!machineId) return;
  const record = agents.get(machineId);
  if (record) {
    record.lastSeen = Date.now();
    if (record.ws !== ws && record.ws?.readyState === WebSocket.OPEN) {
      try {
        record.ws.close();
      } catch {
        /* ignore */
      }
    }
    record.ws = ws;
    ws.role = "agent";
    ws.machineId = machineId;
    ws.isNative = true;
  }
}

function subscribeAgents(ws) {
  ws.role = ws.role || "host";
  agentSubscribers.add(ws);
  safeSend(ws, {
    type: "agent-list",
    agents: [...agents.values()].map(agentSnapshot),
  });
}

function connectAgent(ws, data) {
  if (ws.role !== "host" && !agentSubscribers.has(ws)) {
    ws.role = "host";
  }
  if (ws.sessionId) {
    return safeSend(ws, { type: "error", message: "End the current session first." });
  }

  const machineId = String(data.machineId || "").trim();
  const record = agents.get(machineId);
  if (!record?.ws || record.ws.readyState !== WebSocket.OPEN) {
    return safeSend(ws, { type: "error", message: "That endpoint is offline." });
  }
  if (record.ws.sessionId) {
    return safeSend(ws, { type: "error", message: "That endpoint is already in a session." });
  }

  const sessionId = generateSessionId();
  sessions.set(sessionId, {
    host: ws,
    client: record.ws,
    pending: null,
    clientNative: true,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    unattended: true,
    controlGranted: consentAllowsControl(record),
  });

  ws.sessionId = sessionId;
  ws.role = "host";
  record.ws.sessionId = sessionId;
  record.inSession = true;

  safeSend(ws, {
    type: "session-created",
    sessionId,
    expiresInMs: SESSION_TTL_MS,
    unattended: true,
  });
  safeSend(ws, {
    type: "client-approved",
    native: true,
    hostname: record.hostname,
    machineId,
  });
  safeSend(record.ws, {
    type: "assign-session",
    sessionId,
    allowControl: true,
  });

  if (sessions.get(sessionId)?.controlGranted) {
    safeSend(ws, {
      type: "control-response",
      allowed: true,
      native: true,
      preApproved: true,
    });
  }

  broadcastAgentList();
}

function consentAllowsControl(record) {
  return Boolean(record?.ws?.isNative);
}

function resumeSession(ws, data) {
  const sessionId = String(data.sessionId || "")
    .toUpperCase()
    .trim();
  const session = sessions.get(sessionId);
  if (!session) {
    return safeSend(ws, { type: "error", message: "That session no longer exists." });
  }

  const role = data.role === "host" ? "host" : "client";
  ws.sessionId = sessionId;
  ws.role = role;

  if (role === "host") {
    session.host = ws;
    ws.isNative = false;
    return safeSend(ws, { type: "session-resumed", sessionId });
  }

  if (session.client) {
    return safeSend(ws, { type: "error", message: "This session already has a connected client." });
  }

  session.client = ws;
  session.clientNative = Boolean(data.native);
  ws.isNative = session.clientNative;
  safeSend(ws, { type: "session-resumed", sessionId });
  if (session.host) {
    safeSend(session.host, { type: "client-reconnected" });
  }
}

function createSession(ws) {
  if (ws.sessionId) return;

  const sessionId = generateSessionId();
  sessions.set(sessionId, {
    host: ws,
    client: null,
    pending: null,
    clientNative: false,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    controlGranted: false,
  });

  ws.sessionId = sessionId;
  ws.role = "host";

  safeSend(ws, {
    type: "session-created",
    sessionId,
    expiresInMs: SESSION_TTL_MS,
  });
}

function joinSession(ws, data, isNative) {
  const sessionId = String(data.sessionId || "")
    .toUpperCase()
    .trim();

  const session = sessions.get(sessionId);

  if (!session) {
    return safeSend(ws, {
      type: "error",
      message: "That session code was not found or has expired.",
    });
  }

  if (session.expiresAt < Date.now()) {
    teardownSession(sessionId, "expired");
    return safeSend(ws, {
      type: "error",
      message: "That session code has expired.",
    });
  }

  if (session.client || session.pending) {
    return safeSend(ws, {
      type: "error",
      message: "Someone is already connected to this session.",
    });
  }

  session.pending = ws;
  ws.sessionId = sessionId;
  ws.role = "client";
  ws.isNative = isNative;

  safeSend(ws, { type: "waiting-for-approval", native: isNative });
  safeSend(session.host, {
    type: "client-waiting",
    native: isNative,
    agentName: data.agentName || "Desktop Agent",
  });
}

function approveClient(ws) {
  if (ws.role !== "host") return;
  const session = sessions.get(ws.sessionId);
  if (!session || !session.pending) return;

  session.client = session.pending;
  session.clientNative = Boolean(session.pending.isNative);
  session.pending = null;

  safeSend(session.client, {
    type: "join-approved",
    native: session.clientNative,
  });
  safeSend(ws, {
    type: "client-approved",
    native: session.clientNative,
  });
}

function denyClient(ws) {
  if (ws.role !== "host") return;
  const session = sessions.get(ws.sessionId);
  if (!session || !session.pending) return;

  safeSend(session.pending, { type: "join-denied" });
  session.pending.sessionId = null;
  session.pending.close();
  session.pending = null;
}

function relaySignal(ws, data) {
  const session = sessions.get(ws.sessionId);
  if (!session) return;

  if (ws.role === "host" && session.client && !session.clientNative) {
    safeSend(session.client, { type: "signal", payload: data.payload });
  } else if (ws.role === "client" && session.host && !ws.isNative) {
    safeSend(session.host, { type: "signal", payload: data.payload });
  }
}

function relayFrame(ws, data) {
  if (ws.role !== "client" && ws.role !== "agent") return;
  const session = sessions.get(ws.sessionId);
  if (!session?.host) return;

  safeSend(session.host, {
    type: "frame",
    data: data.data,
    width: data.width,
    height: data.height,
    ts: data.ts || Date.now(),
  });
}

function notifyStreamStarted(ws) {
  if (ws.role !== "client" && ws.role !== "agent") return;
  const session = sessions.get(ws.sessionId);
  if (!session?.host) return;
  safeSend(session.host, {
    type: session.clientNative ? "native-stream-started" : "stream-started",
  });
}

function relayChat(ws, data) {
  const session = sessions.get(ws.sessionId);
  if (!session) return;

  const text = String(data.text || "").slice(0, 2000);
  const target = ws.role === "host" ? session.client : session.host;
  safeSend(target, { type: "chat", text, from: ws.role });
}

function relayControlRequest(ws) {
  if (ws.role !== "host") return;
  const session = sessions.get(ws.sessionId);
  if (!session?.client) return;
  safeSend(session.client, { type: "control-request" });
}

function relayControlResponse(ws, data) {
  if (ws.role !== "client" && ws.role !== "agent") return;
  const session = sessions.get(ws.sessionId);
  if (!session?.host) return;
  const allowed = Boolean(data.allowed);
  session.controlGranted = allowed;
  safeSend(session.host, {
    type: "control-response",
    allowed,
    native: Boolean(ws.isNative),
  });
}

function relayControlRevoke(ws) {
  const session = sessions.get(ws.sessionId);
  if (!session) return;

  session.controlGranted = false;
  const target = ws.role === "host" ? session.client : session.host;
  safeSend(target, { type: "control-revoked" });
  if (ws.role === "client" || ws.role === "agent") {
    safeSend(session.host, { type: "control-revoked" });
  }
}

function relayControlEvent(ws, data) {
  if (ws.role !== "host") return;
  const session = sessions.get(ws.sessionId);
  if (!session?.client || !session.controlGranted) return;
  if (!data.event || typeof data.event !== "object") return;

  const payload = {
    type: "control-event",
    event: data.event,
  };

  if (data.screenSize && typeof data.screenSize === "object") {
    const w = parseInt(data.screenSize.width, 10);
    const h = parseInt(data.screenSize.height, 10);
    if (w > 0 && h > 0) {
      payload.screenSize = { width: w, height: h };
    }
  }

  safeSend(session.client, payload);
}

function endSessionByUser(ws) {
  if (!ws.sessionId) return;
  teardownSession(ws.sessionId, "ended-by-user");
}

function handleClose(ws) {
  agentSubscribers.delete(ws);

  if (ws.role === "agent" && ws.machineId) {
    if (ws.sessionId) {
      releaseAgentSession(ws, true);
    }
    agents.delete(ws.machineId);
    broadcastAgentList();
    return;
  }

  const sessionId = ws.sessionId;
  if (!sessionId) return;

  const session = sessions.get(sessionId);
  if (!session) return;

  if (ws.role === "host") {
    session.host = null;
    if (session.client?.role === "agent") {
      safeSend(session.client, { type: "session-ended", reason: "host-left" });
      releaseAgentSession(session.client, false);
    } else if (session.client) {
      safeSend(session.client, { type: "host-left" });
    }
    return;
  }

  if (session.client === ws) {
    session.client = null;
    session.clientNative = false;
    if (session.host) {
      safeSend(session.host, { type: "client-left" });
    }
  }
  if (session.pending === ws) {
    session.pending = null;
  }
}

server.listen(PORT, "0.0.0.0", () => {
  console.log("--------------------------------------------------");
  console.log(`Remote support server listening on port ${PORT}`);
  console.log(`Protocol: ${USE_TLS ? "https/wss" : "http/ws"}`);
  console.log(`Open: http://localhost:${PORT}/viewer.html`);
  console.log(`Browser client: /client.html`);
  console.log(`Native agent: RemoteSupport.Agent (C#)`);
  console.log("--------------------------------------------------");
});