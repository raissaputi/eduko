// src/lib/recorder.js
// Screen recording utility using MediaRecorder API

class ScreenRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.isRecording = false;
  }

  async start() {
    try {
      // Request screen capture with audio (optional)
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          mediaSource: 'screen',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false // Set to true if you want system audio
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
        this.stop();
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

  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.isRecording) {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
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

        resolve(blob);
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
