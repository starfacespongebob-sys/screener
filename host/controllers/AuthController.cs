using Microsoft.AspNetCore.Mvc;

namespace HostPortal.Controllers
{
    public class LoginRequest
    {
        public string Username { get; set; }
        public string Password { get; set; }
    }

    [ApiController]
    [Route("api/auth")]
    public class AuthController : ControllerBase
    {
        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginRequest request)
        {
            if (request.Username == "admin" && request.Password == "password")
            {
                return Ok(new { token = "fake-jwt-token" });
            }

            return Unauthorized(new { message = "Invalid username or password" });
        }
    }
}
