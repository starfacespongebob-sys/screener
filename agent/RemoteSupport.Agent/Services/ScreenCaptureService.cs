using System.Diagnostics;
using System.Runtime.InteropServices;

namespace RemoteSupport.Agent.Services;

public sealed class ScreenCaptureService : IDisposable
{
    private readonly string _framePath;
    private int _screenWidth;
    private int _screenHeight;
    private double _scaleFactor = 1.0;

    public ScreenCaptureService()
    {
        _framePath = Path.Combine(Path.GetTempPath(), "remote-support-frame.jpg");
        DetectScreenSize();
    }

    public int Width => _screenWidth;
    public int Height => _screenHeight;
    public double ScaleFactor => _scaleFactor;

    public void SetDimensions(int width, int height)
    {
        if (width > 0) _screenWidth = width;
        if (height > 0) _screenHeight = height;
    }

    private void DetectScreenSize()
    {
        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            try
            {
                var psi = new ProcessStartInfo("system_profiler", "SPDisplaysDataType")
                {
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                };
                using var proc = Process.Start(psi);
                var output = proc?.StandardOutput.ReadToEnd() ?? "";
                proc?.WaitForExit();

                int? physicalW = null;
                int? physicalH = null;
                int? logicalW = null;
                int? logicalH = null;

                foreach (var line in output.Split('\n'))
                {
                    if (line.Contains("Resolution:"))
                    {
                        var parts = line.Split(':')[1].Trim().Split('x');
                        if (parts.Length == 2 &&
                            int.TryParse(parts[0].Trim(), out var w) &&
                            int.TryParse(parts[1].Trim().Split(' ')[0], out var h))
                        {
                            physicalW = w;
                            physicalH = h;
                        }
                    }
                    else if (line.Contains("UI Looks like:"))
                    {
                        var parts = line.Split(':')[1].Trim().Split('x');
                        if (parts.Length == 2 &&
                            int.TryParse(parts[0].Trim(), out var w) &&
                            int.TryParse(parts[1].Trim().Split(' ')[0], out var h))
                        {
                            logicalW = w;
                            logicalH = h;
                        }
                    }
                }

                if (logicalW is > 0 and var lw && logicalH is > 0 and var lh)
                {
                    _screenWidth = lw;
                    _screenHeight = lh;
                    if (physicalW is > 0 and var pw && physicalH is > 0 and var ph)
                    {
                        _scaleFactor = Math.Max(1.0, Math.Min(pw / (double)lw, ph / (double)lh));
                    }
                    return;
                }

                if (physicalW is > 0 and var pw2 && physicalH is > 0 and var ph2)
                {
                    _screenWidth = pw2;
                    _screenHeight = ph2;
                    return;
                }
            }
            catch
            {
                // fall through to defaults
            }
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            try
            {
                var script = "Add-Type -AssemblyName System.Windows.Forms; " +
                             "$b=[Windows.Forms.Screen]::PrimaryScreen.Bounds; " +
                             "Write-Output ($b.Width.ToString() + 'x' + $b.Height.ToString())";
                var psi = new ProcessStartInfo
                {
                    FileName = "powershell",
                    Arguments = $"-NoProfile -Command \"{script}\"",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };
                using var proc = Process.Start(psi);
                var output = proc?.StandardOutput.ReadToEnd().Trim() ?? "";
                proc?.WaitForExit(3000);
                var parts = output.Split('x');
                if (parts.Length == 2 &&
                    int.TryParse(parts[0].Trim(), out var w) &&
                    int.TryParse(parts[1].Trim(), out var h))
                {
                    _screenWidth = w;
                    _screenHeight = h;
                    return;
                }
            }
            catch
            {
                // fall through to defaults
            }
        }

        _screenWidth = 1920;
        _screenHeight = 1080;
    }

    public byte[]? CaptureJpeg()
    {
        try
        {
            if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
            {
                return CaptureMacOS();
            }

            if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
            {
                return CaptureWindows();
            }

            return CaptureMacOS();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Capture error: {ex.Message}");
            return null;
        }
    }

    private byte[]? CaptureMacOS()
    {
        if (File.Exists(_framePath))
        {
            File.Delete(_framePath);
        }

        var psi = new ProcessStartInfo
        {
            FileName = "/usr/sbin/screencapture",
            Arguments = $"-x -C -t jpg \"{_framePath}\"",
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using var proc = Process.Start(psi);
        proc?.WaitForExit(5000);

        if (proc?.ExitCode != 0 || !File.Exists(_framePath))
        {
            return null;
        }

        // Downscale to keep frames under WebSocket limits and reduce latency.
        var scalePsi = new ProcessStartInfo
        {
            FileName = "/usr/bin/sips",
            Arguments = $"-Z 1280 \"{_framePath}\"",
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using (var scaleProc = Process.Start(scalePsi))
        {
            scaleProc?.WaitForExit(3000);
        }

        return File.ReadAllBytes(_framePath);
    }

    private byte[]? CaptureWindows()
    {
        // PowerShell screen capture fallback for Windows
        var script = $@"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bmp = New-Object Drawing.Bitmap([Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [Windows.Forms.Screen]::PrimaryScreen.Bounds.Height)
$gfx = [Drawing.Graphics]::FromImage($bmp)
$gfx.CopyFromScreen(0,0,0,0,$bmp.Size)
$bmp.Save('{_framePath.Replace("\\", "\\\\")}', [Drawing.Imaging.ImageFormat]::Jpeg)
";
        var psi = new ProcessStartInfo
        {
            FileName = "powershell",
            Arguments = $"-NoProfile -Command \"{script}\"",
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using var proc = Process.Start(psi);
        proc?.WaitForExit(10000);

        if (!File.Exists(_framePath))
        {
            return null;
        }

        return File.ReadAllBytes(_framePath);
    }

    public void Dispose()
    {
        if (File.Exists(_framePath))
        {
            try { File.Delete(_framePath); } catch { /* ignore */ }
        }
    }
}