import React, { useEffect } from "react";
import { useParams } from "react-router-dom";

function WebRTCClient() {
  const { sessionId } = useParams();

  useEffect(() => {
    // Connect to signaling server
    const ws = new WebSocket("ws://localhost:8080");

    // Create peer connection with STUN/TURN servers for production
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "turn:your-turn-server:3478", username: "user", credential: "pass" }
      ]
    });

    // Send ICE candidates to signaling server
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        ws.send(JSON.stringify({ type: "signal", payload: { candidate: event.candidate } }));
      }
    };

    // Display remote stream in video element
    peerConnection.ontrack = (event) => {
      const remoteVideo = document.getElementById("remoteVideo");
      if (remoteVideo) {
        remoteVideo.srcObject = event.streams[0];
      }
    };

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", sessionId }));
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "signal") {
        if (data.payload.sdp) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.payload));
          if (data.payload.type === "offer") {
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: "signal", payload: answer }));
          }
        } else if (data.payload.candidate) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.payload.candidate));
        }
      }
    };

    // Host side: capture screen and send offer
    (async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      ws.send(JSON.stringify({ type: "signal", payload: offer }));
    })();

  }, [sessionId]);

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Session {sessionId}</h2>
      <video id="remoteVideo" autoPlay playsInline style={{ width: "80%" }} />
    </div>
  );
}

export default WebRTCClient;
