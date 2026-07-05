import React from 'react';

function GuestInteraction({ session }) {
  return (
    <div>
      <h2>Guest Interaction</h2>
      <p>Connected to guest: {session.guest}</p>
      <div style={{ border: '1px solid black', height: '400px' }}>
        {/* WebRTC video stream would be embedded here */}
        <p>[Guest screen stream placeholder]</p>
      </div>
      <button>Toggle Input Control</button>
      <button>Send File</button>
      <button>Open Chat</button>
      <button>End Session</button>
    </div>
  );
}

export default GuestInteraction;
