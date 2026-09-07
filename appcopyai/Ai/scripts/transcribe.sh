#!/bin/bash
WHISPER="$HOME/whisper.cpp"
VIDEOS="$HOME/course-ai/uploads/videos"
OUT="$HOME/course-ai/uploads/transcripts"
mkdir -p "$OUT"
for video in "$VIDEOS"/*.{mp4,mov,avi,mkv}; do
  [ -f "$video" ] || continue
  name=$(basename "$video" | sed "s/\.[^.]*$//")
  out="$OUT/$name.txt"
  if [ -f "$out" ]; then
    echo "⏭  Already done: $name — skipping"
    continue
  fi
  echo "🎙  Transcribing: $name"
  ffmpeg -i "$video" -ar 16000 -ac 1 -c:a pcm_s16le /tmp/audio.wav -y -loglevel quiet
  "$WHISPER/build/bin/whisper-cli" \
    -m "$WHISPER/models/ggml-medium.bin" \
    -f /tmp/audio.wav \
    --language auto \
    --output-txt \
    --output-file "$OUT/$name" \
    --no-timestamps
  echo "✅ Done: $name.txt"
done
echo "🎉 All videos transcribed!"
