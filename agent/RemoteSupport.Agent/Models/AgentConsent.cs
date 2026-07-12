namespace RemoteSupport.Agent.Models;

public sealed class AgentConsent
{
    public bool InstallConsentGranted { get; set; }
    public bool ScreenSharingAllowed { get; set; }
    public bool RemoteControlAllowed { get; set; }
    public DateTimeOffset GrantedAt { get; set; }
    public string? MachineName { get; set; }
}