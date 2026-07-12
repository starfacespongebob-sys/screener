using System.Text.Json;
using RemoteSupport.Agent.Models;

namespace RemoteSupport.Agent.Services;

public sealed class ConfigService
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };
    private readonly string _configPath;

    public ConfigService()
    {
        var dir = GetConfigDirectory();
        Directory.CreateDirectory(dir);
        _configPath = Path.Combine(dir, "agent.json");
    }

    public static string GetConfigDirectory()
    {
        if (OperatingSystem.IsWindows())
        {
            var programData = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
            return Path.Combine(programData, "RemoteSupport");
        }
        return Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".remote-support"
        );
    }

    public AgentConfig LoadOrCreate(string? serverUrl)
    {
        var config = Load();
        if (config is not null)
        {
            if (!string.IsNullOrWhiteSpace(serverUrl))
            {
                config.ServerUrl = serverUrl;
                Save(config);
            }
            return config;
        }

        config = new AgentConfig
        {
            MachineId = Guid.NewGuid().ToString("N"),
            ServerUrl = string.IsNullOrWhiteSpace(serverUrl)
                ? "wss://remotesharing.space"
                : serverUrl,
            InstalledAt = DateTimeOffset.UtcNow,
        };
        Save(config);
        return config;
    }

    public AgentConfig? Load()
    {
        if (!File.Exists(_configPath)) return null;
        try
        {
            return JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(_configPath));
        }
        catch
        {
            return null;
        }
    }

    public void Save(AgentConfig config)
    {
        File.WriteAllText(_configPath, JsonSerializer.Serialize(config, JsonOptions));
    }
}