using Microsoft.AspNetCore.Mvc;

namespace HostPortal.Controllers
{
    [ApiController]
    [Route("api/session")]
    public class SessionController : ControllerBase
    {
        [HttpPost("create")]
        public IActionResult CreateSession()
        {
            var sessionId = Guid.NewGuid().ToString();
            var link = $"http://localhost:5000/session/{sessionId}";
            return Ok(new { link });
        }
    }
}