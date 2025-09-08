/**
 * Voice Recorder Online - JavaScript Module
 * Handles audio recording, playback, and file conversion
 * Updated with better debugging and error handling
 */

class VoiceRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.startTime = null;
        this.timerInterval = null;
        this.stream = null;
        
        this.initializeElements();
        this.bindEvents();
        this.checkBrowserSupport();
        
        console.log('VoiceRecorder initialized');
    }
    
    initializeElements() {
        // Main controls
        this.recordBtn = document.getElementById('recordBtn');
        this.timer = document.getElementById('timer');
        this.timeDisplay = document.getElementById('time-display');
        this.status = document.getElementById('status');
        
        // Settings
        this.formatSelect = document.getElementById('formatSelect');
        this.qualitySelect = document.getElementById('qualitySelect');
        this.qualityDiv = document.getElementById('qualityDiv');
        
        // Preview section
        this.previewSection = document.getElementById('preview-section');
        this.recorderSection = document.getElementById('recorder-section');
        this.audioPreview = document.getElementById('audioPreview');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.recordAgainBtn = document.getElementById('recordAgainBtn');
        
        // Info displays
        this.fileInfo = document.getElementById('fileInfo');
        this.duration = document.getElementById('duration');
        this.fileSize = document.getElementById('fileSize');
        this.fileFormat = document.getElementById('fileFormat');
        
        // Status elements
        this.errorMessage = document.getElementById('errorMessage');
        this.errorText = document.getElementById('errorText');
        this.loading = document.getElementById('loading');
    }
    
    bindEvents() {
        this.recordBtn.addEventListener('click', () => this.toggleRecording());
        this.recordAgainBtn.addEventListener('click', () => this.resetRecorder());
        this.formatSelect.addEventListener('change', () => this.handleFormatChange());
        
        // Handle page visibility change to stop recording when tab is hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRecording) {
                console.log('Page hidden, stopping recording');
                this.stopRecording();
            }
        });
    }
    
    checkBrowserSupport() {
        console.log('Checking browser support...');
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.showError('Your browser does not support audio recording. Please use a modern browser like Chrome, Firefox, or Safari.');
            this.recordBtn.disabled = true;
            return false;
        }
        
        if (!window.MediaRecorder) {
            this.showError('MediaRecorder is not supported in your browser. Please update your browser.');
            this.recordBtn.disabled = true;
            return false;
        }
        
        console.log('Browser support: OK');
        return true;
    }
    
    handleFormatChange() {
        const format = this.formatSelect.value;
        console.log('Format changed to:', format);
        
        if (format === 'wav') {
            this.qualityDiv.style.display = 'none';
        } else {
            this.qualityDiv.style.display = 'block';
        }
    }
    
    async toggleRecording() {
        console.log('Toggle recording clicked, isRecording:', this.isRecording);
        
        if (!this.isRecording) {
            await this.startRecording();
        } else {
            this.stopRecording();
        }
    }
    
    async startRecording() {
        try {
            console.log('Starting recording...');
            this.hideError();
            this.status.textContent = 'Requesting microphone access...';
            
            // Better microphone constraints
            const constraints = {
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: { ideal: 44100 },
                    channelCount: { ideal: 2 }
                }
            };
            
            console.log('Requesting microphone with constraints:', constraints);
            
            // Request microphone access
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('Microphone access granted');
            
            // Get supported MIME type
            const mimeType = this.getSupportedMimeType();
            console.log('Using MIME type:', mimeType);
            
            // Initialize MediaRecorder with better options
            const options = {};
            
            if (mimeType) {
                options.mimeType = mimeType;
            }
            
            // Set bitrate for supported formats
            if (mimeType.includes('webm') || mimeType.includes('ogg')) {
                options.bitsPerSecond = 128000; // 128 kbps
            }
            
            console.log('MediaRecorder options:', options);
            
            this.mediaRecorder = new MediaRecorder(this.stream, options);
            this.audioChunks = [];
            
            // Event handlers with detailed logging
            this.mediaRecorder.ondataavailable = (event) => {
                console.log('Data available:', event.data.size, 'bytes, type:', event.data.type);
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                console.log('MediaRecorder stopped, total chunks:', this.audioChunks.length);
                this.processRecording();
            };
            
            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder error:', event.error);
                this.showError(`Recording error: ${event.error}`);
                this.resetRecorder();
            };
            
            this.mediaRecorder.onstart = () => {
                console.log('MediaRecorder started successfully');
            };
            
            // Start recording with smaller timeslice for better data collection
            this.mediaRecorder.start(500); // Collect data every 500ms
            this.isRecording = true;
            this.startTime = Date.now();
            
            this.updateUIForRecording();
            this.startTimer();
            
            console.log('Recording setup complete');
            
        } catch (error) {
            console.error('Error starting recording:', error);
            
            if (error.name === 'NotAllowedError') {
                this.showError('Microphone access denied. Please allow microphone access and try again.');
            } else if (error.name === 'NotFoundError') {
                this.showError('No microphone found. Please connect a microphone and try again.');
            } else if (error.name === 'NotSupportedError') {
                this.showError('Your browser does not support audio recording. Please use Chrome, Firefox, or Safari.');
            } else {
                this.showError(`Unable to start recording: ${error.message}`);
            }
        }
    }
    
    stopRecording() {
        console.log('Stopping recording...');
        
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Stop all audio tracks
            if (this.stream) {
                this.stream.getTracks().forEach(track => {
                    track.stop();
                    console.log('Audio track stopped');
                });
            }
            
            this.stopTimer();
            this.updateUIForStopped();
            console.log('Recording stopped');
        }
    }
    
    getSupportedMimeType() {
        // Better MIME type detection for different browsers
        const types = [
            'audio/webm;codecs=opus',    // Chrome, Firefox
            'audio/webm',                // Chrome, Firefox fallback
            'audio/mp4;codecs=mp4a.40.2', // Safari
            'audio/mp4',                 // Safari fallback
            'audio/ogg;codecs=opus',     // Firefox
            'audio/ogg',                 // Firefox fallback
            'audio/wav'                  // Fallback
        ];
        
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                console.log(`Supported MIME type found: ${type}`);
                return type;
            }
        }
        
        console.log('Using browser default MIME type');
        return ''; // Let browser decide
    }
    
    updateUIForRecording() {
        this.recordBtn.classList.add('recording');
        this.recordBtn.innerHTML = '<i class="fas fa-stop text-4xl"></i>';
        this.status.textContent = 'Recording... Click to stop';
        this.timer.classList.remove('hidden');
    }
    
    updateUIForStopped() {
        this.recordBtn.classList.remove('recording');
        this.recordBtn.classList.add('processing');
        this.recordBtn.innerHTML = '<i class="fas fa-cog fa-spin text-4xl"></i>';
        this.status.textContent = 'Processing recording...';
    }
    
    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            this.timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }, 1000);
    }
    
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
    
    async processRecording() {
        try {
            console.log('Processing recording...');
            this.showLoading();
            
            console.log('Total audio chunks:', this.audioChunks.length);
            
            if (this.audioChunks.length === 0) {
                throw new Error('No audio data recorded. Please try recording again.');
            }
            
            // Determine the correct MIME type from MediaRecorder
            let mimeType = 'audio/webm';
            if (this.mediaRecorder && this.mediaRecorder.mimeType) {
                mimeType = this.mediaRecorder.mimeType;
            }
            
            console.log('Creating blob with MIME type:', mimeType);
            
            // Create audio blob from chunks
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });
            
            console.log('Audio blob created:', audioBlob.size, 'bytes, type:', audioBlob.type);
            
            if (audioBlob.size === 0) {
                throw new Error('Recorded audio is empty. Please try recording again.');
            }
            
            // Create preview URL for playback
            const audioUrl = URL.createObjectURL(audioBlob);
            this.audioPreview.src = audioUrl;
            
            // Get duration when audio loads
            this.audioPreview.onloadedmetadata = () => {
                const duration = this.audioPreview.duration;
                const minutes = Math.floor(duration / 60);
                const seconds = Math.floor(duration % 60);
                this.duration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                console.log('Audio duration:', duration, 'seconds');
            };
            
            // Upload and convert audio
            await this.uploadAudio(audioBlob);
            
        } catch (error) {
            console.error('Error processing recording:', error);
            this.showError(`Failed to process recording: ${error.message}`);
            this.resetRecorder();
        }
    }
    
    async uploadAudio(audioBlob) {
        try {
            console.log('Uploading audio blob:', audioBlob.size, 'bytes');
            
            const formData = new FormData();
            
            // Determine file extension based on MIME type
            let extension = 'webm';
            if (audioBlob.type.includes('mp4')) {
                extension = 'm4a';
            } else if (audioBlob.type.includes('ogg')) {
                extension = 'ogg';
            } else if (audioBlob.type.includes('wav')) {
                extension = 'wav';
            }
            
            const filename = `recording.${extension}`;
            console.log('Upload filename:', filename);
            
            formData.append('audio', audioBlob, filename);
            formData.append('format', this.formatSelect.value);
            formData.append('quality', this.qualitySelect.value);
            
            console.log('Upload settings:', {
                format: this.formatSelect.value,
                quality: this.qualitySelect.value,
                size: audioBlob.size,
                type: audioBlob.type
            });
            
            console.log('Sending upload request...');
            
            const response = await fetch('/upload_audio', {
                method: 'POST',
                body: formData
            });
            
            console.log('Server response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log('Server response data:', result);
            
            if (result.success) {
                console.log('Upload successful, showing preview');
                this.showPreview(result);
            } else {
                throw new Error(result.error || 'Upload failed');
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            this.showError(`Upload failed: ${error.message}`);
            this.resetRecorder();
        } finally {
            this.hideLoading();
        }
    }
    
    showPreview(result) {
        console.log('Showing preview with result:', result);
        
        // Update file info
        this.fileSize.textContent = result.file_size;
        this.fileFormat.textContent = `${result.format} (${result.quality})`;
        
        // Set download link
        this.downloadBtn.href = result.download_url;
        this.downloadBtn.download = result.filename;
        
        console.log('Download link set:', result.download_url);
        
        // Show preview section
        this.recorderSection.classList.add('hidden');
        this.previewSection.classList.remove('hidden');
        this.previewSection.classList.add('fade-in');
        
        console.log('Preview section shown');
    }
    
    resetRecorder() {
        console.log('Resetting recorder...');
        
        // Reset UI state
        this.isRecording = false;
        this.recordBtn.classList.remove('recording', 'processing');
        this.recordBtn.innerHTML = '<i class="fas fa-microphone text-4xl"></i>';
        this.status.textContent = 'Click the microphone to start recording';
        this.timer.classList.add('hidden');
        this.timeDisplay.textContent = '00:00';
        
        // Hide sections
        this.previewSection.classList.add('hidden');
        this.recorderSection.classList.remove('hidden');
        this.hideError();
        this.hideLoading();
        
        // Clear audio chunks
        this.audioChunks = [];
        
        // Stop timer
        this.stopTimer();
        
        // Clean up audio URL
        if (this.audioPreview.src) {
            URL.revokeObjectURL(this.audioPreview.src);
            this.audioPreview.src = '';
        }
        
        // Stop audio tracks
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        
        console.log('Recorder reset complete');
    }
    
    showError(message) {
        console.error('Showing error:', message);
        this.errorText.textContent = message;
        this.errorMessage.classList.remove('hidden');
        this.errorMessage.classList.add('error-shake');
        
        // Remove shake animation after it completes
        setTimeout(() => {
            this.errorMessage.classList.remove('error-shake');
        }, 500);
    }
    
    hideError() {
        this.errorMessage.classList.add('hidden');
    }
    
    showLoading() {
        console.log('Showing loading...');
        this.loading.classList.remove('hidden');
    }
    
    hideLoading() {
        console.log('Hiding loading...');
        this.loading.classList.add('hidden');
    }
}

// Initialize the voice recorder when the page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing Voice Recorder...');
    window.voiceRecorder = new VoiceRecorder();
});

// Handle page unload to clean up resources
window.addEventListener('beforeunload', () => {
    console.log('Page unloading, cleaning up...');
    if (window.voiceRecorder && window.voiceRecorder.stream) {
        window.voiceRecorder.stream.getTracks().forEach(track => track.stop());
    }
});

// Add debug function for manual testing
window.debugRecorder = function() {
    if (window.voiceRecorder) {
        console.log('=== Recorder Debug Info ===');
        console.log('isRecording:', window.voiceRecorder.isRecording);
        console.log('audioChunks length:', window.voiceRecorder.audioChunks.length);
        console.log('mediaRecorder state:', window.voiceRecorder.mediaRecorder ? window.voiceRecorder.mediaRecorder.state : 'null');
        console.log('stream active:', window.voiceRecorder.stream ? window.voiceRecorder.stream.active : 'null');
        
        // Test server connection
        fetch('/debug')
            .then(response => response.json())
            .then(data => {
                console.log('Server debug info:', data);
            })
            .catch(error => {
                console.error('Server connection error:', error);
            });
    } else {
        console.log('VoiceRecorder not initialized');
    }
};
