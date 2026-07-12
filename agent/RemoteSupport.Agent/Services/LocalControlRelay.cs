using System.Net;
using System.Text;
using System.Text.Json;

namespace RemoteSupport.Agent.Services;

/// <summary>
/// Local HTTP bridge so browser-based guests on the same machine can forward
/// control events to the native agent (browsers cannot drive OS input directly).
/// </summary>
public sealed class LocalControlRelay : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private readonly RemoteControlService _control;
    private readonly HttpListener _listener;
    private readonly CancellationTokenSource _cts = new();
    private Task? _loop;

    public LocalControlRelay(RemoteControlService control)
    {
        _control = control;
        _listener = new HttpListener();
        _listener.Prefixes.Add("http://127.0.0.1:9877/");
    }

    public void Start()
    {
        try
        {
            _listener.Start();
            _loop = Task.Run(() => ListenAsync(_cts.Token));
            Console.WriteLine("Local control relay listening on http://127.0.0.1:9877/");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Local control relay unavailable: {ex.Message}");
        }
    }

    private async Task ListenAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested && _listener.IsListening)
        {
            HttpListenerContext? ctx = null;
            try
            {
                ctx = await _listener.GetContextAsync().WaitAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }
            catch (HttpListenerException)
            {
                break;
            }

            if (ctx is not null)
            {
                _ = Task.Run(() => HandleRequestAsync(ctx), cancellationToken);
            }
        }
    }

    private async Task HandleRequestAsync(HttpListenerContext ctx)
    {
        try
        {
            if (ctx.Request.HttpMethod == "OPTIONS")
            {
                ctx.Response.StatusCode = 204;
                ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*");
                ctx.Response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
                ctx.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");
                ctx.Response.Close();
                return;
            }

            var path = ctx.Request.Url?.AbsolutePath ?? "/";
            if (ctx.Request.HttpMethod == "GET" && path == "/health")
            {
                await WriteJsonAsync(ctx, 200, new { ok = true });
                return;
            }

            if (ctx.Request.HttpMethod == "POST" && path == "/control")
            {
                using var reader = new StreamReader(ctx.Request.InputStream, ctx.Request.ContentEncoding);
                var body = await reader.ReadToEndAsync();
                using var doc = JsonDocument.Parse(body);
                var root = doc.RootElement;

                if (root.TryGetProperty("event", out var ev))
                {
                    JsonElement? screenSize = root.TryGetProperty("screenSize", out var ss)
                        ? ss
                        : null;
                    _control.HandleEvent(ev, screenSize);
                }

                await WriteJsonAsync(ctx, 200, new { ok = true });
                return;
            }

            ctx.Response.StatusCode = 404;
            ctx.Response.Close();
        }
        catch
        {
            try
            {
                ctx.Response.StatusCode = 400;
                ctx.Response.Close();
            }
            catch
            {
                // ignore
            }
        }
    }

    private static async Task WriteJsonAsync(HttpListenerContext ctx, int status, object payload)
    {
        var json = JsonSerializer.Serialize(payload, JsonOptions);
        var bytes = Encoding.UTF8.GetBytes(json);
        ctx.Response.StatusCode = status;
        ctx.Response.ContentType = "application/json";
        ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*");
        ctx.Response.ContentLength64 = bytes.Length;
        await ctx.Response.OutputStream.WriteAsync(bytes);
        ctx.Response.Close();
    }

    public void Dispose()
    {
        _cts.Cancel();
        try
        {
            if (_listener.IsListening) _listener.Stop();
        }
        catch
        {
            // ignore
        }
        _listener.Close();
        _cts.Dispose();
    }
}