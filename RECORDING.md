# Screen Recording System

## Overview
Implements browser-based screen recording using the MediaRecorder API to capture participant activity during tasks.

## How It Works

### Frontend (TaskScreen.jsx)
1. **When task starts (`task_enter`)**: 
   - Creates new `ScreenRecorder` instance
   - Requests screen capture permission via `getDisplayMedia()`
   - Starts recording with VP9/VP8 codec at 30fps
   - Shows "🔴 Recording" indicator in UI
   - Logs `recording_start` event

2. **During task**:
   - MediaRecorder collects 1-second chunks
   - User sees visual indicator of recording status
   - Recording continues until submit or time expires

3. **When task ends (submit or auto-submit)**:
   - Stops MediaRecorder
   - Creates blob from all chunks
   - Uploads via FormData to `/api/session/{session_id}/recording`
   - Logs `recording_stop` and `recording_uploaded` events

### Backend (sessions.py)
- **POST `/api/session/{session_id}/recording`**
  - Receives multipart form with:
    - `recording`: webm video file
    - `problem_id`: which problem was recorded
  - Saves as: `data/sessions/{session_id}/recording_{problem_id}_{timestamp}.webm`
  - Returns file metadata (path, size, filename)

### Recording Library (recorder.js)
- **ScreenRecorder class**:
  - `start()`: Initiates screen capture with permission request
  - `stop()`: Finalizes recording and returns blob
  - Handles user cancellation (browser "Stop sharing" button)
  - Automatic fallback from VP9 to VP8 codec

## Error Handling
- **Permission denied**: Shows "⚠️ No recording" indicator
- **Browser cancellation**: Automatically stops recording
- **Upload failure**: Logs error but doesn't block submission
- **Unsupported browser**: Gracefully degrades (no recording)

## Events Logged
```
recording_start: { problem_id, session_id }
recording_stop: { problem_id }
recording_uploaded: { problem_id, size_bytes }
recording_error: { problem_id, error }
recording_upload_error: { problem_id, error }
```

## Files Saved
```
data/sessions/{session_id}/
  ├── recording_fe1_{timestamp}.webm
  ├── recording_fe2_{timestamp}.webm
  ├── recording_dv1_{timestamp}.webm
  └── recording_dv2_{timestamp}.webm
```

## Browser Compatibility
- Chrome/Edge: Full support (VP9)
- Firefox: Full support (VP8)
- Safari: Limited (requires user permission, VP8 only)

## Privacy Notes
- Recording only starts when user grants permission
- User can stop recording at any time via browser UI
- No audio captured by default (can be enabled in recorder.js)
- Recording indicator always visible when active

## Future Enhancements (TODO #5)
- [ ] S3/Cloud Storage upload for offsite backup
- [ ] Real-time streaming instead of final upload
- [ ] Video compression before upload
- [ ] Automatic retry on upload failure
- [ ] Recording quality settings (resolution, framerate)
