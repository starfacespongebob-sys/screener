using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = WebApplication.CreateBuilder(args);

// Add services for controllers and Swagger
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Enable Swagger in development
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Serve React UI from wwwroot
app.UseDefaultFiles();   // looks for index.html
app.UseStaticFiles();    // serves static assets

app.UseHttpsRedirection();
app.UseAuthorization();

app.UseRouting();

// Map API controllers and fallback to React index.html
app.MapControllers();

// Fallback: if no API route matches, serve React index.html
app.MapFallbackToFile("index.html");

app.Run();
