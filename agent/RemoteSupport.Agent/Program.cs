using RemoteSupport.Agent;
using RemoteSupport.Agent.Models;
using RemoteSupport.Agent.Services;

var serverUrl = GetArg(args, "--server");
var sessionCode = GetArg(args, "--session");
var autoAccept = args.Contains("--accept-consent");
var revokeConsent = args.Contains("--revoke-consent");
var grantConsent = args.Contains("--grant-consent");
var daemonMode = args.Contains("--daemon");
var fps = int.TryParse(GetArg(args, "--fps"), out var parsedFps) ? parsedFps : 3;

if (revokeConsent)
{
    new ConsentService().Revoke();
    Console.WriteLine("Install consent revoked. Uninstall the agent or re-run install to connect again.");
    return 0;
}

if (grantConsent)
{
    try
    {
        new ConsentService().RequestInstallConsent(autoAccept);
        new ConfigService().LoadOrCreate(serverUrl ?? "wss://remotesharing.space");
        Console.WriteLine("Consent saved. You may start the agent with --daemon.");
        return 0;
    }
    catch (InvalidOperationException ex)
    {
        Console.Error.WriteLine(ex.Message);
        return 1;
    }
}

if (daemonMode)
{
    using var cts = new CancellationTokenSource();
    Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };
    return await AgentDaemon.RunAsync(serverUrl ?? "wss://remotesharing.space", autoAccept, cts.Token);
}

if (string.IsNullOrWhiteSpace(sessionCode))
{
    PrintUsage();
    return 1;
}

return await RunSessionModeAsync(serverUrl, sessionCode, autoAccept, fps);

static async Task<int> RunSessionModeAsync(string? serverUrl, string sessionCode, bool autoAccept, int fps)
{
    var consentService = new ConsentService();
    AgentConsent consent;
    try
    {
        consent = consentService.RequestInstallConsent(autoAccept);
    }
    catch (InvalidOperationException ex)
    {
        Console.Error.WriteLine(ex.Message);
        return 1;
    }

    using var cts = new CancellationTokenSource();
    Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

    var serverUri = new Uri(serverUrl ?? "ws://localhost:8080");
    using var capture = new ScreenCaptureService();
    await using var signaling = new SignalingService(serverUri, sessionCode, consent);
    var remoteControl = new RemoteControlService(capture);
    using var localRelay = new LocalControlRelay(remoteControl);
    localRelay.Start();

    var approved = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var ended = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);

    signaling.OnApproved += () =>
    {
        Console.WriteLine("Approved. Starting screen stream.");
        approved.TrySetResult();
    };

    signaling.OnSessionEnded += reason =>
    {
        Console.WriteLine($"Session ended: {reason}");
        ended.TrySetResult(reason);
    };

    signaling.OnControlRequested += () =>
    {
        var allowed = consent.RemoteControlAllowed;
        _ = signaling.SendControlResponseAsync(allowed, cts.Token);
        if (allowed) remoteControl.SetEnabled(true);
    };

    signaling.OnControlRevoked += () => remoteControl.SetEnabled(false);

    signaling.OnControlEvent += (ev, screenSize) =>
    {
        if (consent.RemoteControlAllowed) remoteControl.HandleEvent(ev, screenSize);
    };

    signaling.OnChat += text => Console.WriteLine($"[technician] {text}");

    Console.WriteLine($"Connecting to {serverUri} session {sessionCode.ToUpperInvariant()}…");
    await signaling.ConnectAsync(cts.Token);

    try
    {
        await approved.Task.WaitAsync(TimeSpan.FromMinutes(5), cts.Token);
    }
    catch (TimeoutException)
    {
        Console.Error.WriteLine("Timed out waiting for approval.");
        return 1;
    }

    await signaling.NotifyStreamStartedAsync(cts.Token);

    var frameInterval = TimeSpan.FromMilliseconds(1000.0 / Math.Clamp(fps, 1, 15));
    var streaming = Task.Run(async () =>
    {
        while (!cts.Token.IsCancellationRequested && !ended.Task.IsCompleted)
        {
            try
            {
                var jpeg = capture.CaptureJpeg();
                if (jpeg is { Length: > 0 })
                {
                    await signaling.SendFrameAsync(jpeg, capture.Width, capture.Height, cts.Token);
                }
                await Task.Delay(frameInterval, cts.Token);
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Stream error: {ex.Message}");
                break;
            }
        }
    }, cts.Token);

    await Task.WhenAny(ended.Task, streaming);
    cts.Cancel();
    try { await streaming; } catch (OperationCanceledException) { }

    return 0;
}

static string? GetArg(string[] args, string name)
{
    for (var i = 0; i < args.Length - 1; i++)
    {
        if (args[i].Equals(name, StringComparison.OrdinalIgnoreCase))
            return args[i + 1];
    }
    return null;
}

static void PrintUsage()
{
    Console.WriteLine("Remote Support Desktop Agent");
    Console.WriteLine();
    Console.WriteLine("Install consent (run once during setup):");
    Console.WriteLine("  RemoteSupport.Agent --grant-consent [--server wss://remotesharing.space]");
    Console.WriteLine();
    Console.WriteLine("Unattended (runs in background after consent):");
    Console.WriteLine("  RemoteSupport.Agent --daemon [--server wss://remotesharing.space]");
    Console.WriteLine();
    Console.WriteLine("One-time session (legacy):");
    Console.WriteLine("  RemoteSupport.Agent --session <CODE> [--server ws://host:8080]");
    Console.WriteLine();
    Console.WriteLine("Options:");
    Console.WriteLine("  --accept-consent   Auto-grant consent (testing only)");
    Console.WriteLine("  --revoke-consent   Remove stored consent and stop access");
    Console.WriteLine("  --fps              Frames per second for session mode (default 3)");
}