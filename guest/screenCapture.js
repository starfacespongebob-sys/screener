// screenCapture.js
const { desktopCapturer } = require('electron');

async function captureScreen() {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sources[0].id
      }
    }
  });
  return stream;
}

module.exports = { captureScreen };
