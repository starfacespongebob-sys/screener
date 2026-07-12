namespace RemoteSupport.Agent.Models;

public sealed class AgentConfig
{
    public string MachineId { get; set; } = "";
    public string ServerUrl { get; set; } = "wss://remotesharing.space";
    public string? Organization { get; set; }
    public DateTimeOffset InstalledAt { get; set; }
}