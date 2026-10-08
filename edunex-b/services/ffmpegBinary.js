const bundledFfmpeg = require('ffmpeg-static');

function ffmpegBinary() {
  return String(process.env.FFMPEG_PATH || '').trim() || bundledFfmpeg || 'ffmpeg';
}

module.exports = ffmpegBinary;
