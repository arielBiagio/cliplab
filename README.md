# ClipLab

**Your footage, a fresh perspective.** A browser-based video editing playground
built with React, TypeScript, Vite, and Tailwind CSS.

[Live demo](https://cliplab-playground.netlify.app)

![ClipLab editing workspace](docs/images/workspace.png)

Open a video from your computer, explore different looks, and see every adjustment
in the preview. Your video stays on your device.

## Features

- **Local video loading:** choose a file or drag and drop it onto the preview.
- **Playback controls:** play, pause, restart, loop, mute, and seek.
- **Interactive timeline:** preview frames while dragging forward or backward.
  Playback resumes after the gesture if the video was playing beforehand.
- **Visual adjustments:** brightness, contrast, saturation, hue, and sepia.
- **Color grading:** exposure, shadows, highlights, temperature, and tint using
  the WebGL2 preview.
- **Before/after comparison:** drag a split between the original and edited image
  while both sides display the same video frame.
- **Presets:** Original, Cinematic, Vintage, Black & White, and Sepia.
- **Undo and redo:** restore previous adjustments, with one history entry per
  slider gesture.
- **Custom keyboard shortcuts:** personalize playback and seek controls.
- **Responsive workspace:** keep the preview and timeline visible while scrolling
  through effects independently.

## Getting started

Requires Node.js 24 and npm.

```sh
git clone https://github.com/arielBiagio/cliplab.git
cd cliplab
npm ci
npm run dev
```

Open the local URL printed in the terminal. No backend, API keys, or environment
variables are required.

## Using the editor

1. Open a video using the upload button or drop it onto the preview.
2. Play the video or drag across the timeline to find a moment.
3. Adjust the sliders or choose a preset.
4. Use Undo, Redo, or Reset to explore different looks.

Click **Compare** above the preview to show the original on the left and the edit
on the right. Drag the divider or focus it and use the arrow keys. Home shows the
full edit; End shows the full original. Comparison also works during playback and
timeline scrubbing. It is a view option and does not change your edits or history.

Brightness, contrast, and saturation range from 0 to 200%, with 100% as the neutral
value. Hue ranges from −180° to 180°, and sepia from 0 to 100%; both start at zero.
Exposure ranges from −2 to +2 EV in 0.1-stop increments. Temperature moves from
cool to warm, and tint from green to magenta, on relative scales from −100 to +100.
Shadows and highlights selectively darken or lighten darker and brighter areas on
scales from −100 to +100. All five grading controls start at zero and work with
presets, Reset, Undo, and Redo.

If graphics acceleration becomes unavailable, the editor uses its standard preview.
Exposure, shadows, highlights, temperature, and tint are temporarily bypassed and
disabled. Their values are retained and applied again when the graphics preview
recovers.
Comparison is also suspended until the graphics preview is available again.

Replacing the video starts a new session and resets playback, adjustments,
history, and the comparison view. Reloading the page also clears the current session.

## Keyboard shortcuts

| Action                               | Default shortcut                   |
| ------------------------------------ | ---------------------------------- |
| Play / pause                         | Space                              |
| Seek backward / forward five seconds | Left / Right arrow                 |
| Undo                                 | Ctrl / Cmd + Z                     |
| Redo                                 | Ctrl / Cmd + Shift + Z or Ctrl + Y |

Use the keyboard button to customize the three playback shortcuts. These
preferences are saved between sessions. Global shortcuts respect focused buttons,
inputs, and sliders, and pause while shortcut settings are open.

## Privacy

Videos are opened locally and are never uploaded or saved by the application.
Only keyboard shortcut preferences are stored in the browser. No analytics or
external fonts are loaded.

## Compatibility and scope

ClipLab targets desktop Chrome and Edge, with a responsive layout for smaller
screens. MP4/H.264 and WebM are useful starting points; playback depends on the
file's codec and browser support.

Effects change the preview only. ClipLab does not export or render a new video
file, trim clips, or provide multitrack editing. Seeking is time-based rather than
frame-accurate, and large or high-resolution videos may require more processing
power. Tonal adjustments cannot recover detail absent from the source, and the
preview targets SDR video rather than professional HDR color management.
