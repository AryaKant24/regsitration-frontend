# Webcam Video Capture – Kiosk UI (Prompt for Claude)

## 🎯 Problem Context
We are building a student registration kiosk. As part of the flow:

> A student stands in front of the kiosk, and their webcam video is automatically captured for ~8–10 seconds at 30 FPS.  
> The UI should feel smooth, minimal, and guided.

In later phases, we will:
- Extract frames from the video
- Downsample them
- Send them via multipart/form-data to a backend

**For now, ONLY implement the webcam capture UI and recording logic.**

---

## ✅ Requirements

### 1. Webcam Capture
- Use browser APIs:
  - `navigator.mediaDevices.getUserMedia`
  - `MediaRecorder`
- Access webcam video stream
- Record video for **8–10 seconds**
- Assume **30 FPS input**
- Automatically stop recording after duration

---

### 2. UI (Kiosk-Friendly)
Design a **clean, distraction-free interface**:
- Centered video preview
- Subtle instructions like:
  - “Look at the camera”
  - “Recording will start automatically”
- Visual recording indicator (e.g., red dot or timer)
- Progress indicator (countdown or progress bar)
- No clutter — kiosk-friendly UX

---

### 3. UX Flow
- On load → request camera permission
- Show live preview
- Automatically start recording after a short delay (e.g., 1–2 seconds)
- Show recording status
- Stop after 8–10 seconds
- Store recorded video in memory (Blob)

---

### 4. Code Quality
- Use **React (preferred)** with hooks
- Functional components only
- Clean separation:
  - `CameraPreview`
  - `RecorderController`
  - `ProgressIndicator`
- Write readable, maintainable code
- Add comments for future extension points (frame extraction, sampling, upload)

---

### 5. Future-Proofing (Important)
Even though we are NOT implementing sampling yet:
- Structure code so that we can later:
  - Access video frames from the recording
  - Downsample frames (e.g., 1 FPS)
  - Build multipart/form-data payload

Add TODO comments like:

```js
// TODO: Extract frames from recorded Blob
// TODO: Downsample frames before upload
// TODO: Construct multipart/form-data payload
```

---

## 📋 Decisions & Clarifications

| # | Topic | Decision |
|---|---|---|
| 1 | **Project Setup** | Vite + React (JavaScript) — lightweight, fast HMR, ideal for this scope |
| 2 | **Styling** | Light mode, warm white color palette, professional & clean. Vanilla CSS. |
| 3 | **Recording Duration** | Fixed at **10 seconds** |
| 4 | **Post-Recording UI** | Show a "Recording Complete ✓" confirmation screen. Video analysis comes later. |
| 5 | **Language** | JavaScript (no TypeScript preference) |
| 6 | **Camera** | Front-facing / built-in PC camera (`facingMode: "user"`) |