const { mouse, keyboard, Key, Button } = require("@nut-tree/nut-js");

async function applyInput(event) {
  if (event.type === 'mouse') {
    // Move mouse
    await mouse.move([event.x, event.y]);

    // Handle clicks
    if (event.click) {
      if (event.click === 'left') await mouse.click(Button.LEFT);
      if (event.click === 'right') await mouse.click(Button.RIGHT);
      if (event.click === 'middle') await mouse.click(Button.MIDDLE);
    }
  }

  if (event.type === 'keyboard') {
    // Convert raw key string to nut.js Key enum
    const key = Key[event.key.toUpperCase()];
    if (key) {
      await keyboard.type(key);
    }
  }
}

module.exports = { applyInput };
