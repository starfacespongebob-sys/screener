using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using RemoteSupport.Agent.Models;

namespace RemoteSupport.Agent.Services;

public sealed class SignalingService : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly Uri _serverUri;
    private readonly string _sessionId;
    private readonly Models.AgentConsent _consent;
    private ClientWebSocket? _ws;
    private CancellationTokenSource? _cts;

    public event Action? OnApproved;
    public event Action<string>? OnSessionEnded;
    public event Action? OnControlRequested;
    public event Action? OnControlRevoked;
    public event Action<JsonElement, JsonElement?>? OnControlEvent;
    public event Action<string>? OnChat;

    public SignalingService(Uri serverUri, string sessionId, AgentConsent consent)
    {
        _serverUri = serverUri;
        _sessionId = sessionId.ToUpperInvariant();
        _consent = consent;
    }

    public async Task ConnectAsync(CancellationToken cancellationToken)
    {
        _ws = new ClientWebSocket();
        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

        await _ws.ConnectAsync(_serverUri, _cts.Token);

        await SendAsync(new
        {
            type = "join-session-native",
            sessionId = _sessionId,
            agentName = _consent.MachineName ?? Environment.MachineName,
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

    public async Task SendChatAsync(string text, CancellationToken cancellationToken)
    {
        await SendAsync(new { type = "chat", text }, cancellationToken);
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
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    return;
                }
                ms.Write(buffer, 0, result.Count);
            } while (!result.EndOfMessage);

            var json = Encoding.UTF8.GetString(ms.ToArray());
            JsonDocument doc;
            try
            {
                doc = JsonDocument.Parse(json);
            }
            catch
            {
                continue;
            }

            using (doc)
            {
                var root = doc.RootElement;
                if (!root.TryGetProperty("type", out var typeEl))
                {
                    continue;
                }

                switch (typeEl.GetString())
                {
                    case "join-approved":
                        OnApproved?.Invoke();
                        break;
                    case "session-ended":
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
                        Console.WriteLine("Remote control revoked by technician.");
                        OnControlRevoked?.Invoke();
                        break;
                    case "chat":
                        if (root.TryGetProperty("text", out var text))
                        {
                            OnChat?.Invoke(text.GetString() ?? "");
                        }
                        break;
                    case "join-denied":
                        OnSessionEnded?.Invoke("denied");
                        break;
                    case "error":
                        var msg = root.TryGetProperty("message", out var m)
                            ? m.GetString() ?? "error"
                            : "error";
                        OnSessionEnded?.Invoke(msg);
                        break;
                }
            }
        }
    }

    private async Task SendAsync(object payload, CancellationToken cancellationToken = default)
    {
        if (_ws?.State != WebSocketState.Open)
        {
            return;
        }

        try
        {
            var json = JsonSerializer.Serialize(payload, JsonOptions);
            var bytes = Encoding.UTF8.GetBytes(json);
            await _ws.SendAsync(bytes, WebSocketMessageType.Text, true, cancellationToken);
        }
        catch (WebSocketException)
        {
            // Host ended the session or the socket dropped.
        }
        catch (IOException)
        {
            // Connection closed while sending.
        }
    }

    public async ValueTask DisposeAsync()
    {
        _cts?.Cancel();

        if (_ws?.State == WebSocketState.Open)
        {
            try
            {
                await _ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "agent shutdown", CancellationToken.None);
            }
            catch
            {
                // ignore
            }
        }

        _ws?.Dispose();
        _cts?.Dispose();
    }
}