# Transcripts

| File | Source video | Commentary |
|---|---|---|
| `video-1-dashboard-explanation.txt` | `DASHBOARD EXPLANATION.mp4` (9:51) | Yes — full spoken walkthrough |
| `video-2-all-other-tabs-explanation.txt` | `All other tabs - baiord explanation.mov` (8:45) | Yes — full spoken walkthrough |
| `video-3-all-tabs-silent-walkthrough.txt` | `All tabs Baiord.mov` (3:24) | **No — the video is silent** |

## About video 3

`All tabs Baiord.mov` contains no speech. Measured levels: mean −56.4 dBFS,
peak −30.2 dBFS — room tone only.

It was transcribed twice: once normally (which produced nothing), and once with
+30 dB gain, a bandpass filter, normalisation and voice-activity detection
disabled. The second attempt produced two lines of well-known Whisper
hallucination ("Thank you very much for watching this video…"), which is what a
speech model emits when handed silence.

The file is kept as evidence of the attempt. Video 3 was analysed **visually**,
frame by frame — scene-change keyframes plus a one-frame-per-six-seconds sweep —
and its content is folded into `docs/VIDEO-REQUIREMENTS.md` alongside the two
narrated videos.

## Method

No transcription tooling existed on the machine. Installed locally without sudo:
Node 22, `ffmpeg-static`, and `faster-whisper` (Whisper `small`, int8 CPU) in a
virtualenv. Audio was demuxed to 16 kHz mono WAV and transcribed with VAD
filtering. Timestamps in the transcripts are `[hh:mm:ss - hh:mm:ss]` and are
cited throughout the requirements document.
