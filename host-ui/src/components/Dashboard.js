import React from 'react';

function Dashboard({ sessions }) {
  return (
    <div>
      <h2>Dashboard</h2>
      <p>Active Sessions: {sessions.length}</p>
      <ul>
        {sessions.map(s => (
          <li key={s.id}>
            {s.host} ↔ {s.guest} (ID: {s.id})
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Dashboard;
