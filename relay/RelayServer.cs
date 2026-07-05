using System.Net.Sockets;

namespace RelayService {
    public class RelayServer {
        private readonly TcpListener _listener;
        public RelayServer(int port) => _listener = new TcpListener(System.Net.IPAddress.Any, port);

        public void Start() {
            _listener.Start();
            while (true) {
                var client = _listener.AcceptTcpClient();
                HandleClient(client);
            }
        }

        private void HandleClient(TcpClient client) {
            using var stream = client.GetStream();
            byte[] buffer = new byte[4096];
            int bytesRead = stream.Read(buffer, 0, buffer.Length);
            stream.Write(buffer, 0, bytesRead); // Echo for demo
        }
    }
}
