using System.Text.Json;
using RemoteSupport.Agent.Models;

namespace RemoteSupport.Agent.Services;

public sealed class ConsentService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly string _consentPath;

    public ConsentService()
    {
        var configDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".remote-support"
        );
        Directory.CreateDirectory(configDir);
        _consentPath = Path.Combine(configDir, "consent.json");
    }

    public AgentConsent? Load()
    {
        if (!File.Exists(_consentPath))
        {
            return null;
        }

        try
        {
            var json = File.ReadAllText(_consentPath);
            return JsonSerializer.Deserialize<AgentConsent>(json);
        }
        catch
        {
            return null;
        }
    }

    public void Save(AgentConsent consent)
    {
        var json = JsonSerializer.Serialize(consent, JsonOptions);
        File.WriteAllText(_consentPath, json);
    }

    public void Revoke()
    {
        if (File.Exists(_consentPath))
        {
            File.Delete(_consentPath);
        }
    }

    public AgentConsent RequestInstallConsent(bool autoAccept = false)
    {
        var existing = Load();
        if (existing?.InstallConsentGranted == true)
        {
            return existing;
        }

        if (!autoAccept)
        {
            Console.WriteLine();
            Console.WriteLine("=== Remote Support Agent — One-Time Install Consent ===");
            Console.WriteLine("Your IT / tech team will be able to:");
            Console.WriteLine("  • See your screen when they start a support session");
            Console.WriteLine("  • Control mouse and keyboard (if enabled by your org)");
            Console.WriteLine("  • Connect remotely while this agent is running");
            Console.WriteLine();
            Console.WriteLine("This permission is stored until you revoke it or uninstall.");
            Console.WriteLine("Revoke later: RemoteSupport.Agent --revoke-consent");
            Console.WriteLine();
            Console.Write("Grant permission? [y/N]: ");
            var answer = Console.ReadLine()?.Trim().ToLowerInvariant();
            if (answer is not ("y" or "yes"))
            {
                throw new InvalidOperationException("Install consent was not granted.");
            }
        }

        var consent = new AgentConsent
        {
            InstallConsentGranted = true,
            ScreenSharingAllowed = true,
            RemoteControlAllowed = true,
            GrantedAt = DateTimeOffset.UtcNow,
            MachineName = Environment.MachineName,
        };

        Save(consent);
        Console.WriteLine("Permission saved. You will not be prompted again until admin disconnect.");
        return consent;
    }
}