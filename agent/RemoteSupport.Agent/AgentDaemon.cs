using RemoteSupport.Agent.Models;
using RemoteSupport.Agent.Services;

namespace RemoteSupport.Agent;

public static class AgentDaemon
{
    public static async Task<int> RunAsync(string serverUrl, bool autoAccept, CancellationToken cancellationToken)
    {
        var consentService = new ConsentService();
        if (autoAccept)
        {
            consentService.RequestInstallConsent(true);
        }
        else
        {
            try
            {
                consentService.RequestInstallConsent(false);
            }
            catch (InvalidOperationException ex)
            {
                Console.Error.WriteLine(ex.Message);
                return 1;
            }
        }

        var config = new ConfigService().LoadOrCreate(serverUrl);
        var serverUri = new Uri(config.ServerUrl);
        var consent = consentService.Load()!;

        Console.WriteLine("Remote Support Agent — unattended mode");
        Console.WriteLine($"Machine ID: {config.MachineId}");
        Console.WriteLine($"Server:     {config.ServerUrl}");
        Console.WriteLine($"Host:       {consent.MachineName}");
        Console.WriteLine("Press Ctrl+C to stop.");
        Console.WriteLine();

        var delay = TimeSpan.FromSeconds(3);

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await RunConnectionAsync(serverUri, config, consent, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Connection error: {ex.Message}");
            }

            if (!cancellationToken.IsCancellationRequested)
            {
                Console.WriteLine($"Reconnecting in {delay.TotalSeconds:0}s…");
                await Task.Delay(delay, cancellationToken);
                delay = TimeSpan.FromMilliseconds(Math.Min(delay.TotalMilliseconds * 1.5, 30000));
            }
        }

        return 0;
    }

    private static async Task RunConnectionAsync(
        Uri serverUri,
        AgentConfig config,
        AgentConsent consent,
        CancellationToken cancellationToken)
    {
        using var capture = new ScreenCaptureService();
        await using var signaling = new DaemonSignalingService(serverUri, config, consent);
        var remoteControl = new RemoteControlService(capture);
        using var localRelay = new LocalControlRelay(remoteControl);
        localRelay.Start();

        var streamingCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        Task? streamingTask = null;

        void StopStreaming()
        {
            streamingCts.Cancel();
            streamingCts.Dispose();
            streamingCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            streamingTask = null;
        }

        signaling.OnAssignSession += () =>
        {
            StopStreaming();
            streamingCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            streamingTask = StartStreamingAsync(signaling, capture, streamingCts.Token);
        };

        signaling.OnAssignSessionWithControl += allowControl =>
        {
            if (!allowControl || !consent.RemoteControlAllowed) return;
            _ = signaling.SendControlResponseAsync(true, cancellationToken);
            remoteControl.SetEnabled(true);
            Console.WriteLine("Remote control pre-approved for unattended session.");
        };

        signaling.OnSessionEnded += reason =>
        {
            Console.WriteLine($"Session ended: {reason}");
            StopStreaming();
        };

        signaling.OnControlRequested += () =>
        {
            var allowed = consent.RemoteControlAllowed;
            _ = signaling.SendControlResponseAsync(allowed, cancellationToken);
            if (allowed) remoteControl.SetEnabled(true);
        };

        signaling.OnControlRevoked += () => remoteControl.SetEnabled(false);

        signaling.OnControlEvent += (ev, screenSize) =>
        {
            if (consent.RemoteControlAllowed) remoteControl.HandleEvent(ev, screenSize);
        };

        signaling.OnChat += text => Console.WriteLine($"[technician] {text}");

        await signaling.ConnectAndRegisterAsync(cancellationToken);

        while (!cancellationToken.IsCancellationRequested)
        {
            await Task.Delay(1000, cancellationToken);
        }

        StopStreaming();
        if (streamingTask is not null)
        {
            try { await streamingTask; } catch (OperationCanceledException) { }
        }
    }

    private static async Task StartStreamingAsync(
        DaemonSignalingService signaling,
        ScreenCaptureService capture,
        CancellationToken cancellationToken)
    {
        await signaling.NotifyStreamStartedAsync(cancellationToken);
        var interval = TimeSpan.FromMilliseconds(333);

        while (!cancellationToken.IsCancellationRequested && signaling.ActiveSessionId is not null)
        {
            try
            {
                var jpeg = capture.CaptureJpeg();
                if (jpeg is { Length: > 0 })
                {
                    await signaling.SendFrameAsync(jpeg, capture.Width, capture.Height, cancellationToken);
                }
                await Task.Delay(interval, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Stream error: {ex.Message}");
                break;
            }
        }
    }
}