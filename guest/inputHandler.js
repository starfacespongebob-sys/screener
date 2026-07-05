const { uIOhook, UiohookKey } = require("uiohook-napi");
const robot = require("robotjs"); // REMOVE THIS

async function applyInput(event) {
  if (event.type === 'mouse') {
    // uiohook does not move the mouse, so use system calls instead
    // OR use your C# agent to move the mouse
  }

  if (event.type === 'keyboard') {
    const key = UiohookKey[event.key.toUpperCase()];
    if (key) {
      uIOhook.keyTap(key);
    }
  }
}

module.exports = { applyInput };
