using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Minimal endpoint to confirm relay is running
app.MapGet("/", () => "Relay Service running on port 8041");

// TODO: integrate RelayService.cs logic here
app.Run();
