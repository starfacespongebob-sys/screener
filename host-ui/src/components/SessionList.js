import React from 'react';

function SessionList({ sessions, setActiveSession }) {
  return (
    <div>
      <h2>Sessions</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th><th>Host</th><th>Guest</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.host}</td>
              <td>{s.guest}</td>
              <td>Active</td>
              <td>
                <button onClick={() => setActiveSession(s)}>Join</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default SessionList;
