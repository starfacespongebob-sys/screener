// inputHandler.js
const robot = require('robotjs');

function applyInput(event) {
  if (event.type === 'mouse') {
    robot.moveMouse(event.x, event.y);
    if (event.click) robot.mouseClick(event.click);
  }
  if (event.type === 'keyboard') {
    robot.keyTap(event.key);
  }
}

module.exports = { applyInput };
