import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import WebRTCClient from "./WebRTCClient";
import Home from "./Home";

function App() {
  return (
    <Router>
      <Routes>
        {/* Host login + session creation */}
        <Route path="/" element={<Home />} />

        {/* Guest session join by UUID */}
        <Route path="/session/:sessionId" element={<WebRTCClient />} />
      </Routes>
    </Router>
  );
}

export default App;
