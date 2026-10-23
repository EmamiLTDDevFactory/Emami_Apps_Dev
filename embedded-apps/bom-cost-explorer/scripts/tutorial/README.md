# Tutorial video (public/tutorial/)

The "Tutorial" button in the top bar plays `public/tutorial/bom-simulator-tutorial.mp4` with chapters (`chapters.json`,
`chapters.vtt`) and optional captions (`bom-simulator-tutorial.vtt`). Re-record it when screens change:

1. Start the mock SAP and the app with the plan module, AI and the cost watch on:
   `MOCK_SAP_PORT=4598 MOCK_SAP_DELAY_MS=300 npx tsx mock/server.ts` and
   `NEXT_PUBLIC_AI_ENABLED=true NEXT_PUBLIC_WATCH_ENABLED=true NEXT_PUBLIC_PLAN_MODULE_ENABLED=true NEXT_PUBLIC_SAP_GATEWAY_HOST=http://localhost:4598 NEXT_PUBLIC_SAP_SYSTEM=NGD NEXT_PUBLIC_APP_ENV=development NEXT_PUBLIC_ACCESS_API_URL=http://access.test/api npx next dev -p 3297`
2. `node scripts/tutorial/record.mjs <out-dir> <chromium-executable>` (needs `playwright`; macOS `say`/`afinfo` for the
   narration, voice Rishi). It writes `video.webm`, the narration clips and `timings.json`; each step shows a caption and
   highlights what it clicks. Edit the steps at the top of the script. The cost watch screens get demo answers from
   `watchMock.mjs` (no hub backend needed). `TUTORIAL_ONLY=11 node scripts/tutorial/record.mjs ...` rehearses one chapter.
3. `node scripts/tutorial/mix.mjs <out-dir> <ffmpeg> public/tutorial` (a full ffmpeg, e.g. `ffmpeg-static`): delays each
   narration clip to its step, mixes it onto the video, encodes H.264 CRF 30 + AAC 96k mono with faststart, and writes
   the captions, `chapters.vtt` and `chapters.json`.
