import React, { useState } from 'react';

function SessionForm({ setSessions }) {
  const [guest, setGuest] = useState('');

  const createSession = async () => {
    const res = await fetch('http://localhost:5000/api/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: 'admin', guest })
    });
    const data = await res.json();
    setSessions(prev => [...prev, data]);
    alert(`Session created! Link: http://localhost:5000/join/${data.id}`);
  };

  return (
    <div>
      <h2>Create Session</h2>
      <input
        type="text"
        placeholder="Guest name"
        value={guest}
        onChange={e => setGuest(e.target.value)}
      />
      <button onClick={createSession}>Create</button>
    </div>
  );
}

export default SessionForm;
