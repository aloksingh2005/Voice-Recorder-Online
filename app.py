from flask import Flask, render_template, request, jsonify, send_file
import os
import subprocess
import tempfile
import threading
import time
from datetime import datetime
from werkzeug.utils import secure_filename
import uuid
import shutil

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
app.config['UPLOAD_FOLDER'] = 'static/temp'

# Ensure temp directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def check_ffmpeg():
    """Check if FFmpeg is available"""
    try:
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True)
        return result.returncode == 0
    except FileNotFoundError:
        return False

def convert_audio(input_path, output_path, format_type, quality='192'):
    """Convert audio using FFmpeg with detailed logging"""
    try:
        print(f"Converting: {input_path} -> {output_path}")
        print(f"Format: {format_type}, Quality: {quality}")
        
        if not os.path.exists(input_path):
            return False, f"Input file not found: {input_path}"
        
        if format_type.lower() == 'mp3':
            cmd = [
                'ffmpeg', '-i', input_path,
                '-codec:a', 'libmp3lame',
                '-b:a', f'{quality}k',
                '-ar', '44100',
                '-ac', '2',
                '-y',  # Overwrite output file
                output_path
            ]
        elif format_type.lower() == 'wav':
            cmd = [
                'ffmpeg', '-i', input_path,
                '-codec:a', 'pcm_s16le',
                '-ar', '44100',
                '-ac', '2',
                '-y',
                output_path
            ]
        else:
            return False, "Unsupported format"
        
        print(f"FFmpeg command: {' '.join(cmd)}")
        
        # Execute FFmpeg command
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        print(f"FFmpeg return code: {result.returncode}")
        if result.stdout:
            print(f"FFmpeg stdout: {result.stdout}")
        if result.stderr:
            print(f"FFmpeg stderr: {result.stderr}")
        
        if result.returncode == 0 and os.path.exists(output_path):
            file_size = os.path.getsize(output_path)
            print(f"Output file created: {output_path}, Size: {file_size} bytes")
            return True, "Conversion successful"
        else:
            return False, f"FFmpeg error: {result.stderr}"
            
    except subprocess.TimeoutExpired:
        return False, "Conversion timeout"
    except FileNotFoundError:
        return False, "FFmpeg not found. Please install FFmpeg."
    except Exception as e:
        print(f"Conversion exception: {str(e)}")
        return False, f"Conversion error: {str(e)}"

@app.route('/')
def index():
    """Serve the main recorder page"""
    ffmpeg_available = check_ffmpeg()
    if not ffmpeg_available:
        print("WARNING: FFmpeg is not available!")
    return render_template('index.html')

@app.route('/upload_audio', methods=['POST'])
def upload_audio():
    """Handle audio upload and conversion with detailed logging"""
    try:
        print("=== Audio Upload Request ===")
        
        # Check FFmpeg availability
        if not check_ffmpeg():
            return jsonify({'error': 'FFmpeg is not installed on the server. Please install FFmpeg.'}), 500
        
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        format_type = request.form.get('format', 'mp3').lower()
        quality = request.form.get('quality', '192')
        
        print(f"Received file: {audio_file.filename}")
        print(f"Format: {format_type}, Quality: {quality}")
        
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Validate format
        if format_type not in ['mp3', 'wav']:
            return jsonify({'error': 'Invalid format. Use mp3 or wav'}), 400
        
        # Generate unique filename
        unique_id = str(uuid.uuid4())[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Save uploaded file temporarily
        temp_input = os.path.join(app.config['UPLOAD_FOLDER'], f"temp_{unique_id}.webm")
        audio_file.save(temp_input)
        
        print(f"Saved input file: {temp_input}")
        print(f"Input file size: {os.path.getsize(temp_input)} bytes")
        
        # Generate output filename
        output_filename = f"recording_{timestamp}_{unique_id}.{format_type}"
        output_path = os.path.join(app.config['UPLOAD_FOLDER'], output_filename)
        
        print(f"Output path: {output_path}")
        
        # Convert audio using FFmpeg
        success, message = convert_audio(temp_input, output_path, format_type, quality)
        
        # Clean up temporary input file
        try:
            os.remove(temp_input)
            print(f"Cleaned up input file: {temp_input}")
        except Exception as e:
            print(f"Error cleaning up input file: {e}")
        
        if success:
            # Get file size for response
            file_size = os.path.getsize(output_path)
            file_size_mb = round(file_size / (1024 * 1024), 2)
            
            print(f"Conversion successful! Output file size: {file_size_mb} MB")
            
            response_data = {
                'success': True,
                'filename': output_filename,
                'file_size': f"{file_size_mb} MB",
                'download_url': f"/download/{output_filename}",
                'format': format_type.upper(),
                'quality': f"{quality} kbps" if format_type == 'mp3' else "Uncompressed"
            }
            
            print(f"Response: {response_data}")
            return jsonify(response_data)
        else:
            print(f"Conversion failed: {message}")
            return jsonify({'error': f'Conversion failed: {message}'}), 500
            
    except Exception as e:
        print(f"Upload error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Server error: {str(e)}'}), 500

@app.route('/download/<filename>')
def download_file(filename):
    """Serve converted audio file for download"""
    try:
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
        
        print(f"Download requested: {filename}")
        print(f"File path: {file_path}")
        
        if not os.path.exists(file_path):
            print(f"File not found: {file_path}")
            return jsonify({'error': 'File not found'}), 404
        
        print(f"Serving file: {file_path}")
        
        # Schedule file deletion after download (5 minutes delay)
        def delete_after_delay():
            time.sleep(300)  # Wait 5 minutes
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    print(f"Deleted file after download: {filename}")
            except Exception as e:
                print(f"Error deleting file: {e}")
        
        threading.Thread(target=delete_after_delay, daemon=True).start()
        
        return send_file(
            file_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/octet-stream'
        )
        
    except Exception as e:
        print(f"Download error: {str(e)}")
        return jsonify({'error': f'Download error: {str(e)}'}), 500

# Debug route to check server status
@app.route('/debug')
def debug():
    """Debug endpoint to check server status"""
    ffmpeg_status = check_ffmpeg()
    temp_files = []
    try:
        temp_files = os.listdir(app.config['UPLOAD_FOLDER'])
    except:
        pass
    
    return jsonify({
        'ffmpeg_available': ffmpeg_status,
        'temp_folder': app.config['UPLOAD_FOLDER'],
        'temp_files': temp_files,
        'timestamp': datetime.now().isoformat()
    })

if __name__ == '__main__':
    print("=== Voice Recorder Server Starting ===")
    print(f"FFmpeg available: {check_ffmpeg()}")
    print(f"Temp folder: {app.config['UPLOAD_FOLDER']}")
    
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('FLASK_ENV') == 'development'
    app.run(host='0.0.0.0', port=port, debug=True)  # Always debug for now
