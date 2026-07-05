using Microsoft.AspNetCore.Mvc;

namespace HostPortal.Controllers {
    [ApiController]
    [Route("/")]
    public class HomeController : ControllerBase {
        [HttpGet]
        public IActionResult Index() {
            return Ok("Host Portal is running. Use /api/auth/login or /api/session/create.");
        }
    }
}
