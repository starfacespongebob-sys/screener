using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using RemoteSupport.Agent.Models;

namespace RemoteSupport.Agent.Services;

public sealed class DaemonSignalingService : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly Uri _serverUri;
    private readonly AgentConfig _config;
    private readonly AgentConsent _consent;
    private ClientWebSocket? _ws;
    private CancellationTokenSource? _cts;

    public event Action? OnAssignSession;
    public event Action<bool>? OnAssignSessionWithControl;
    public event Action<string>? OnSessionEnded;
    public event Action? OnControlRequested;
    public event Action? OnControlRevoked;
    public event Action<JsonElement, JsonElement?>? OnControlEvent;
    public event Action<string>? OnChat;

    public string? ActiveSessionId { get; private set; }

    public DaemonSignalingService(Uri serverUri, AgentConfig config, AgentConsent consent)
    {
        _serverUri = serverUri;
        _config = config;
        _consent = consent;
    }

    public async Task ConnectAndRegisterAsync(CancellationToken cancellationToken)
    {
        _ws = new ClientWebSocket();
        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        await _ws.ConnectAsync(_serverUri, _cts.Token);

        await SendAsync(new
        {
            type = "register-agent",
            machineId = _config.MachineId,
            hostname = _consent.MachineName ?? Environment.MachineName,
            agentName = _consent.MachineName ?? Environment.MachineName,
            os = GetOsLabel(),
            platform = RuntimeInformation.OSDescription,
            user = Environment.UserName,
            version = "1.0.0",
        });

        _ = Task.Run(() => ReceiveLoopAsync(_cts.Token), _cts.Token);
    }

    public async Task SendFrameAsync(byte[] jpeg, int width, int height, CancellationToken cancellationToken)
    {
        await SendAsync(new
        {
            type = "frame",
            data = Convert.ToBase64String(jpeg),
            width,
            height,
            ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        }, cancellationToken);
    }

    public async Task NotifyStreamStartedAsync(CancellationToken cancellationToken)
    {
        await SendAsync(new { type = "stream-started" }, cancellationToken);
    }

    public async Task SendControlResponseAsync(bool allowed, CancellationToken cancellationToken)
    {
        await SendAsync(new { type = "control-response", allowed }, cancellationToken);
    }

    private async Task ReceiveLoopAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[8 * 1024 * 1024];

        while (_ws?.State == WebSocketState.Open && !cancellationToken.IsCancellationRequested)
        {
            using var ms = new MemoryStream();
            WebSocketReceiveResult result;
            do
            {
                result = await _ws.ReceiveAsync(buffer, cancellationToken);
                if (result.MessageType == WebSocketMessageType.Close) return;
                ms.Write(buffer, 0, result.Count);
            } while (!result.EndOfMessage);

            JsonDocument doc;
            try
            {
                doc = JsonDocument.Parse(Encoding.UTF8.GetString(ms.ToArray()));
            }
            catch
            {
                continue;
            }

            using (doc)
            {
                var root = doc.RootElement;
                if (!root.TryGetProperty("type", out var typeEl)) continue;

                switch (typeEl.GetString())
                {
                    case "agent-registered":
                        Console.WriteLine("Registered with server. Waiting for technician…");
                        break;
                    case "assign-session":
                        ActiveSessionId = root.GetProperty("sessionId").GetString();
                        var allowControl = root.TryGetProperty("allowControl", out var ac) && ac.GetBoolean();
                        Console.WriteLine($"Technician connected — session {ActiveSessionId}");
                        OnAssignSession?.Invoke();
                        OnAssignSessionWithControl?.Invoke(allowControl);
                        break;
                    case "session-ended":
                        ActiveSessionId = null;
                        var reason = root.TryGetProperty("reason", out var r)
                            ? r.GetString() ?? "ended"
                            : "ended";
                        OnSessionEnded?.Invoke(reason);
                        break;
                    case "control-request":
                        OnControlRequested?.Invoke();
                        break;
                    case "control-event":
                        if (root.TryGetProperty("event", out var ev))
                        {
                            JsonElement? screenSize = root.TryGetProperty("screenSize", out var ss)
                                ? ss
                                : null;
                            OnControlEvent?.Invoke(ev, screenSize);
                        }
                        break;
                    case "control-revoked":
                        Console.WriteLine("Remote control revoked.");
                        OnControlRevoked?.Invoke();
                        break;
                    case "chat":
                        if (root.TryGetProperty("text", out var text))
                            OnChat?.Invoke(text.GetString() ?? "");
                        break;
                    case "error":
                        var msg = root.TryGetProperty("message", out var m)
                            ? m.GetString() ?? "error"
                            : "error";
                        Console.WriteLine($"Server error: {msg}");
                        break;
                }
            }
        }
    }

    private static string GetOsLabel()
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows)) return "Windows";
        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX)) return "macOS";
        if (RuntimeInformation.IsOSPlatform(OSPlatform.Linux)) return "Linux";
        return RuntimeInformation.OSDescription;
    }

    private async Task SendAsync(object payload, CancellationToken cancellationToken = default)
    {
        if (_ws?.State != WebSocketState.Open) return;
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        await _ws.SendAsync(
            Encoding.UTF8.GetBytes(json),
            WebSocketMessageType.Text,
            true,
            cancellationToken
        );
    }

    public async ValueTask DisposeAsync()
    {
        _cts?.Cancel();
        if (_ws?.State == WebSocketState.Open)
        {
            try
            {
                await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "shutdown", CancellationToken.None);
            }
            catch { /* ignore */ }
        }
        _ws?.Dispose();
        _cts?.Dispose();
    }
}