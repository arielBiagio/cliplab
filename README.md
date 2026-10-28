# ClipLab

A browser-based video editing playground. Open a local video, adjust its colors,
and preview different looks in real time.

[Live demo](https://cliplab-playground.netlify.app)

![ClipLab workspace](docs/images/workspace.png)

## Features

- Local video loading through a file picker or drag and drop.
- Playback, seeking, loop, mute, fullscreen, and an interactive timeline.
- WebGL2 preview with exposure, shadows, highlights, white balance, and visual effects.
- Color Mixer with independent hue, saturation, and luminance for eight color ranges.
- Local 3D `.cube` LUT gallery with selection, intensity, and bypass controls.
- Presets and a draggable before/after comparison.
- Undo/redo, individual slider resets, and category resets.
- Automatic local session recovery, including the video, adjustments, LUTs, and playback position.
- Customizable keyboard shortcuts and a responsive, collapsible workspace.

## Built with

- React and TypeScript
- Vite and Tailwind CSS
- WebGL2 and the HTML5 Video API
- IndexedDB for session storage and localStorage for shortcut preferences

## Run locally

Requires Node.js 24 and npm.

```sh
git clone https://github.com/arielBiagio/cliplab.git
cd cliplab
npm ci
npm run dev
```

## Scope and privacy

Videos and LUTs stay on your device. Session recovery uses local browser storage
and does not synchronize between devices. No backend or account is required.

Designed for desktop Chrome and Edge. Effects apply to the preview; video export,
trimming, and multitrack editing are not available.
