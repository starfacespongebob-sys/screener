using System;

namespace HostPortal.Models {
    public class Session {
        public Guid Id { get; set; }
        public string? Host { get; set; }
        public string? Guest { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
