import React, { useState } from "react";

function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState(null);
  const [sessionLink, setSessionLink] = useState(null);
  const [error, setError] = useState(null);

  // Login handler
  const handleLogin = async () => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) throw new Error("Login failed");
      const data = await response.json();
      setToken(data.token);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // Create session handler
  const handleCreateSession = async () => {
    try {
      const response = await fetch("/api/session/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Session creation failed");
      const data = await response.json();
      setSessionLink(data.link);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "Arial" }}>
      <h1>Host Portal</h1>

      {!token ? (
        <div>
          <h2>Login</h2>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <br />
          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <br />
          <button onClick={handleLogin}>Login</button>
        </div>
      ) : (
        <div>
          <h2>Session Management</h2>
          <button onClick={handleCreateSession}>Create Session</button>
          {sessionLink && (
            <p>
              Share this link with guest:{" "}
              <a href={sessionLink} target="_blank" rel="noreferrer">
                {sessionLink}
              </a>
            </p>
          )}
        </div>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}

export default App;
