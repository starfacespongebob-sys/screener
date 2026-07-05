// webrtcClient.js
const { RTCPeerConnection } = window;

async function startConnection(stream, signalingServerUrl) {
  const pc = new RTCPeerConnection();
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  const ws = new WebSocket(signalingServerUrl);
  ws.onmessage = async (msg) => {
    const data = JSON.parse(msg.data);
    if (data.answer) await pc.setRemoteDescription(data.answer);
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ offer }));
}

module.exports = { startConnection };
