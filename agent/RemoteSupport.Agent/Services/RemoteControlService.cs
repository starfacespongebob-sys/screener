using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace RemoteSupport.Agent.Services;

public sealed class RemoteControlService
{
    private readonly ScreenCaptureService _capture;
    private bool _controlEnabled = true;

    public RemoteControlService(ScreenCaptureService capture)
    {
        _capture = capture;
    }

    public void SetEnabled(bool enabled) => _controlEnabled = enabled;

    public void HandleEvent(JsonElement eventEl, JsonElement? screenSizeEl = null)
    {
        if (!_controlEnabled) return;

        if (screenSizeEl is { ValueKind: JsonValueKind.Object })
        {
            ApplyScreenSizeOverride(screenSizeEl.Value);
        }

        if (!eventEl.TryGetProperty("kind", out var kindEl)) return;

        switch (kindEl.GetString())
        {
            case "mouse":
                HandleMouse(eventEl);
                break;
            case "wheel":
                HandleWheel(eventEl);
                break;
            case "key":
                HandleKey(eventEl);
                break;
        }
    }

    private void ApplyScreenSizeOverride(JsonElement screenSize)
    {
        if (screenSize.TryGetProperty("width", out var w) && w.TryGetInt32(out var width) && width > 0)
        {
            _capture.SetDimensions(width, screenSize.TryGetProperty("height", out var h) && h.TryGetInt32(out var height) && height > 0
                ? height
                : _capture.Height);
        }
    }

    private void HandleMouse(JsonElement ev)
    {
        var type = ev.GetProperty("type").GetString();
        var x = ev.GetProperty("x").GetDouble();
        var y = ev.GetProperty("y").GetDouble();
        var px = Clamp((int)Math.Round(x * _capture.Width), 0, Math.Max(_capture.Width - 1, 0));
        var py = Clamp((int)Math.Round(y * _capture.Height), 0, Math.Max(_capture.Height - 1, 0));
        var button = ev.TryGetProperty("button", out var b) ? b.GetInt32() : 0;

        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX) && _capture.ScaleFactor > 1.0)
        {
            px = Clamp((int)Math.Round(px * _capture.ScaleFactor), 0, (int)Math.Round(_capture.Width * _capture.ScaleFactor) - 1);
            py = Clamp((int)Math.Round(py * _capture.ScaleFactor), 0, (int)Math.Round(_capture.Height * _capture.ScaleFactor) - 1);
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            HandleMouseWindows(type, px, py, button);
            return;
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            HandleMouseMac(type, px, py, button);
        }
    }

    private static void HandleMouseWindows(string? type, int px, int py, int button)
    {
        switch (type)
        {
            case "mousemove":
                WinInput.MoveTo(px, py);
                break;
            case "mousedown":
                WinInput.MoveTo(px, py);
                WinInput.MouseDown(button);
                break;
            case "mouseup":
                WinInput.MoveTo(px, py);
                WinInput.MouseUp(button);
                break;
        }
    }

    private static void HandleMouseMac(string? type, int px, int py, int button)
    {
        var moved = false;
        switch (type)
        {
            case "mousemove":
            case "mousedown":
            case "mouseup":
                moved = RunCliclick($"m:{px},{py}");
                break;
        }

        if (type == "mousedown")
        {
            if (!RunCliclick(button == 2 ? "rc:." : "c:."))
            {
                RunMacOsascriptMouse(px, py, button, "mousedown");
            }
        }
        else if (type == "mouseup" && button == 2)
        {
            if (!RunCliclick("rcu:."))
            {
                RunMacOsascriptMouse(px, py, button, "mouseup");
            }
        }
        else if (!moved && type is "mousemove" or "mousedown" or "mouseup")
        {
            RunMacOsascriptMouse(px, py, button, type);
        }
    }

    private static void RunMacOsascriptMouse(int px, int py, int button, string? type)
    {
        RunOsascript($"tell application \"System Events\" to set the cursor position to {{{px}, {py}}}");
        if (type == "mousedown")
        {
            var action = button == 2 ? "right click" : "click";
            RunOsascript($"tell application \"System Events\" to {action} at {{{px}, {py}}}");
        }
    }

    private void HandleWheel(JsonElement ev)
    {
        var deltaY = ev.TryGetProperty("deltaY", out var d) ? d.GetDouble() : 0;
        if (Math.Abs(deltaY) < 0.01) return;

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            WinInput.Scroll((int)Math.Round(-deltaY / 40.0));
            return;
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            var clicks = deltaY > 0 ? -1 : 1;
            RunCliclick($"w:{clicks}");
        }
    }

    private void HandleKey(JsonElement ev)
    {
        var type = ev.GetProperty("type").GetString();
        if (type is not ("keydown" or "keyup")) return;

        var key = ev.TryGetProperty("key", out var k) ? k.GetString() ?? "" : "";
        var code = ev.TryGetProperty("code", out var c) ? c.GetString() ?? "" : "";

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            if (type == "keydown")
            {
                WinInput.KeyDown(key, code);
            }
            else
            {
                WinInput.KeyUp(key, code);
            }
            return;
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX) && type == "keydown")
        {
            HandleKeyMac(key, code);
        }
    }

    private static void HandleKeyMac(string key, string code)
    {
        if (key.Length == 1)
        {
            if (!RunCliclick($"t:{key}"))
            {
                RunOsascript($"tell application \"System Events\" to keystroke \"{EscapeForAppleScript(key)}\"");
            }
            return;
        }

        var special = MapMacSpecialKey(key, code);
        if (special is not null)
        {
            if (!RunCliclick($"kp:{special}"))
            {
                var keyCode = MapMacKeyCode(special);
                if (keyCode >= 0)
                {
                    RunOsascript($"tell application \"System Events\" to key code {keyCode}");
                }
            }
        }
    }

    private static int MapMacKeyCode(string special) =>
        special switch
        {
            "return" => 36,
            "delete" => 51,
            "tab" => 48,
            "escape" => 53,
            "space" => 49,
            "arrow-up" => 126,
            "arrow-down" => 125,
            "arrow-left" => 123,
            "arrow-right" => 124,
            "fwd-delete" => 117,
            "home" => 115,
            "end" => 119,
            "page-up" => 116,
            "page-down" => 121,
            _ => -1,
        };

    private static string EscapeForAppleScript(string value) =>
        value.Replace("\\", "\\\\").Replace("\"", "\\\"");

    private static string? MapMacSpecialKey(string key, string code)
    {
        return key switch
        {
            "Enter" => "return",
            "Backspace" => "delete",
            "Tab" => "tab",
            "Escape" => "escape",
            " " => "space",
            "ArrowUp" => "arrow-up",
            "ArrowDown" => "arrow-down",
            "ArrowLeft" => "arrow-left",
            "ArrowRight" => "arrow-right",
            "Delete" => "fwd-delete",
            "Home" => "home",
            "End" => "end",
            "PageUp" => "page-up",
            "PageDown" => "page-down",
            _ => code switch
            {
                "Enter" => "return",
                "Backspace" => "delete",
                "Tab" => "tab",
                "Escape" => "escape",
                "Space" => "space",
                "ArrowUp" => "arrow-up",
                "ArrowDown" => "arrow-down",
                "ArrowLeft" => "arrow-left",
                "ArrowRight" => "arrow-right",
                _ => null,
            },
        };
    }

    private static int Clamp(int value, int min, int max) => Math.Max(min, Math.Min(max, value));

    private static bool RunCliclick(string args)
    {
        foreach (var path in new[] { "/opt/homebrew/bin/cliclick", "/usr/local/bin/cliclick", "/usr/bin/cliclick" })
        {
            if (Run(path, args)) return true;
        }
        return false;
    }

    private static bool RunOsascript(string script)
    {
        return Run("/usr/bin/osascript", "-e", script);
    }

    private static bool Run(string file, params string[] args)
    {
        if (!File.Exists(file)) return false;

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = file,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            foreach (var arg in args)
            {
                psi.ArgumentList.Add(arg);
            }
            using var proc = Process.Start(psi);
            return proc?.WaitForExit(800) == true && proc.ExitCode == 0;
        }
        catch
        {
            return false;
        }
    }

    private static class WinInput
    {
        private const int InputMouse = 0;
        private const int InputKeyboard = 1;
        private const uint MouseeventfMove = 0x0001;
        private const uint MouseeventfLeftdown = 0x0002;
        private const uint MouseeventfLeftup = 0x0004;
        private const uint MouseeventfRightdown = 0x0008;
        private const uint MouseeventfRightup = 0x0010;
        private const uint MouseeventfMiddledown = 0x0020;
        private const uint MouseeventfMiddleup = 0x0040;
        private const uint MouseeventfWheel = 0x0800;
        private const uint MouseeventfAbsolute = 0x8000;
        private const uint KeyeventfKeyup = 0x0002;
        private const uint KeyeventfExtendedkey = 0x0001;

        [DllImport("user32.dll")]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public int type;
            public InputUnion U;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct InputUnion
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public int mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        public static void MoveTo(int x, int y)
        {
            var screenW = GetSystemMetrics(0);
            var screenH = GetSystemMetrics(1);
            if (screenW <= 0 || screenH <= 0) return;

            var absX = (int)Math.Round(x * 65535.0 / Math.Max(screenW - 1, 1));
            var absY = (int)Math.Round(y * 65535.0 / Math.Max(screenH - 1, 1));

            SendMouse(MouseeventfMove | MouseeventfAbsolute, absX, absY);
        }

        public static void MouseDown(int button)
        {
            SendMouse(button switch
            {
                2 => MouseeventfRightdown,
                1 => MouseeventfMiddledown,
                _ => MouseeventfLeftdown,
            });
        }

        public static void MouseUp(int button)
        {
            SendMouse(button switch
            {
                2 => MouseeventfRightup,
                1 => MouseeventfMiddleup,
                _ => MouseeventfLeftup,
            });
        }

        public static void Scroll(int clicks)
        {
            SendMouse(MouseeventfWheel, 0, 0, clicks * 120);
        }

        public static void KeyDown(string key, string code)
        {
            if (!TryMapVirtualKey(key, code, out var vk, out var extended)) return;
            SendKey(vk, extended, false);
        }

        public static void KeyUp(string key, string code)
        {
            if (!TryMapVirtualKey(key, code, out var vk, out var extended)) return;
            SendKey(vk, extended, true);
        }

        private static void SendMouse(uint flags, int dx = 0, int dy = 0, int mouseData = 0)
        {
            var input = new INPUT
            {
                type = InputMouse,
                U = new InputUnion
                {
                    mi = new MOUSEINPUT
                    {
                        dx = dx,
                        dy = dy,
                        mouseData = mouseData,
                        dwFlags = flags,
                    },
                },
            };
            SendInput(1, new[] { input }, Marshal.SizeOf<INPUT>());
        }

        private static void SendKey(ushort vk, bool extended, bool keyUp)
        {
            var flags = keyUp ? KeyeventfKeyup : 0u;
            if (extended) flags |= KeyeventfExtendedkey;

            var input = new INPUT
            {
                type = InputKeyboard,
                U = new InputUnion
                {
                    ki = new KEYBDINPUT
                    {
                        wVk = vk,
                        dwFlags = flags,
                    },
                },
            };
            SendInput(1, new[] { input }, Marshal.SizeOf<INPUT>());
        }

        private static bool TryMapVirtualKey(string key, string code, out ushort vk, out bool extended)
        {
            extended = false;
            vk = 0;

            if (key.Length == 1)
            {
                vk = (ushort)char.ToUpperInvariant(key[0]);
                return true;
            }

            switch (key)
            {
                case "Enter": vk = 0x0D; return true;
                case "Backspace": vk = 0x08; return true;
                case "Tab": vk = 0x09; return true;
                case "Escape": vk = 0x1B; return true;
                case " ": vk = 0x20; return true;
                case "ArrowUp": vk = 0x26; extended = true; return true;
                case "ArrowDown": vk = 0x28; extended = true; return true;
                case "ArrowLeft": vk = 0x25; extended = true; return true;
                case "ArrowRight": vk = 0x27; extended = true; return true;
                case "Delete": vk = 0x2E; extended = true; return true;
                case "Home": vk = 0x24; extended = true; return true;
                case "End": vk = 0x23; extended = true; return true;
                case "PageUp": vk = 0x21; extended = true; return true;
                case "PageDown": vk = 0x22; extended = true; return true;
                case "Control": vk = 0x11; return true;
                case "Shift": vk = 0x10; return true;
                case "Alt": vk = 0x12; return true;
                case "Meta": vk = 0x5B; extended = true; return true;
            }

            if (code.StartsWith("Key", StringComparison.Ordinal) && code.Length == 4)
            {
                vk = (ushort)code[3];
                return true;
            }

            if (code.StartsWith("Digit", StringComparison.Ordinal) && code.Length == 6)
            {
                vk = (ushort)code[5];
                return true;
            }

            return false;
        }
    }
}