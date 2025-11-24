// src/lib/recorder.js
// Screen recording utility using MediaRecorder API

class ScreenRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.isRecording = false;
  }

  async start(onUserStopped) {
    try {
      // Request screen capture with audio (optional)
      // preferCurrentTab: 'include' will auto-select current tab/window in Chrome
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          displaySurface: 'monitor', // Prefer full screen/monitor
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false, // Disable audio capture
        preferCurrentTab: false, // Don't limit to current tab
        surfaceSwitching: 'exclude', // Prevent switching during recording
        selfBrowserSurface: 'exclude' // Exclude browser UI
      });

      // Remove any audio tracks if user selected them
      this.stream.getAudioTracks().forEach(track => {
        track.stop();
        this.stream.removeTrack(track);
      });

      // Create MediaRecorder
      const options = { mimeType: 'video/webm;codecs=vp9' };
      
      // Fallback to vp8 if vp9 not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8';
      }
      
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.chunks = [];

      // Collect data chunks
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data);
        }
      };

      // Handle stream stop (user clicks browser's "Stop sharing" button)
      this.stream.getVideoTracks()[0].addEventListener('ended', () => {
        // Stop MediaRecorder to finalize the chunks
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
        
        this.isRecording = false;
        
        // Wait a bit for onstop to fire and chunks to be finalized
        setTimeout(() => {
          // Notify parent that user stopped recording with current chunks
          if (onUserStopped) {
            const savedChunks = [...this.chunks];
            onUserStopped(savedChunks);
          }
        }, 100);
      });

      // Start recording with 1-second chunks for incremental upload
      this.mediaRecorder.start(1000);
      this.isRecording = true;

      return { success: true };
    } catch (error) {
      console.error('Recording start failed:', error);
      return { 
        success: false, 
        error: error.name === 'NotAllowedError' 
          ? 'Permission denied' 
          : error.message 
      };
    }
  }

  stop(keepChunks = false) {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve({ blob: null, chunks: [] });
        return;
      }

      this.mediaRecorder.onstop = () => {
        // Save chunks before clearing
        const savedChunks = [...this.chunks];
        
        // Create blob from all chunks
        const blob = new Blob(this.chunks, { type: 'video/webm' });
        
        // Stop all tracks
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
        }

        this.isRecording = false;
        this.mediaRecorder = null;
        this.stream = null;
        this.chunks = [];

        resolve({ blob, chunks: savedChunks });
      };

      this.mediaRecorder.stop();
    });
  }

  getChunks() {
    return [...this.chunks];
  }

  clearChunks() {
    this.chunks = [];
  }
}

export default ScreenRecorder;
