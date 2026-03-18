from flask import Flask, render_template, request, jsonify, session, send_file
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
from io import BytesIO
import uuid

# Try to import reportlab, but don't fail if not available
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from reportlab.lib import colors
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False
    print("Warning: reportlab not installed. PDF download will not work.")

app = Flask(__name__)
app.config['SECRET_KEY'] = '7c36a7ad0427fdf03a38163fb94374b2723e102369b472497eca79397482e174'
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///dicegame.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SESSION_COOKIE_SECURE'] = False
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = 86400 * 30  # 30 days

db = SQLAlchemy(app)

# Database Models
class Player(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    player_number = db.Column(db.String(20), nullable=False)
    device_fingerprint = db.Column(db.String(255), nullable=False, unique=True)  # Unique per device
    registration_date = db.Column(db.DateTime, default=datetime.utcnow)
    game_state = db.relationship('GameState', backref='player', uselist=False, cascade='all, delete-orphan')

class GameState(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    player_id = db.Column(db.Integer, db.ForeignKey('player.id'), unique=True)
    first_roll = db.Column(db.Integer, default=0)
    second_roll = db.Column(db.Integer, default=0)
    score = db.Column(db.Integer, default=0)
    resets_used = db.Column(db.Integer, default=0)
    rolls_remaining = db.Column(db.Integer, default=2)
    game_over = db.Column(db.Boolean, default=False)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# Create tables
with app.app_context():
    db.create_all()

def get_device_fingerprint():
    """Generate a unique device fingerprint based on user agent and IP"""
    import hashlib
    user_agent = request.headers.get('User-Agent', 'unknown')
    ip_address = request.remote_addr
    fingerprint_string = f"{user_agent}_{ip_address}"
    device_fingerprint = hashlib.sha256(fingerprint_string.encode()).hexdigest()
    return device_fingerprint

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/register', methods=['POST'])
def register():
    try:
        device_fingerprint = get_device_fingerprint()
        
        data = request.json
        name = data.get('name', '').strip()
        player_number = data.get('playerNumber', '').strip()
        
        if not name:
            return jsonify({'success': False, 'message': 'Please enter your name!'})
        
        if not player_number:
            return jsonify({'success': False, 'message': 'Please enter your 7-digit roll!'})
        
        # Validate exactly 7 digits
        if len(player_number) != 7:
            return jsonify({'success': False, 'message': 'Roll must be exactly 7 digits!'})
        
        if not player_number.isdigit():
            return jsonify({'success': False, 'message': 'Roll must contain only numbers!'})
        
        if len(name) < 2:
            return jsonify({'success': False, 'message': 'Name must be at least 2 characters!'})
        
        # Check if this device already has an active account
        existing_player = Player.query.filter_by(device_fingerprint=device_fingerprint).first()
        if existing_player:
            return jsonify({
                'success': False, 
                'message': f'This device already has an account: {existing_player.name}! Use a different device or clear your browser data.'
            })
        
        # Create new player with device fingerprint
        new_player = Player(
            name=name,
            player_number=player_number,
            device_fingerprint=device_fingerprint
        )
        db.session.add(new_player)
        db.session.flush()
        
        # Create game state for player
        new_game_state = GameState(player_id=new_player.id)
        db.session.add(new_game_state)
        db.session.commit()
        
        # Store player ID in session
        session['player_id'] = new_player.id
        session['device_fingerprint'] = device_fingerprint
        session.permanent = True
        
        return jsonify({
            'success': True, 
            'message': 'Registration successful!',
            'player': {
                'id': new_player.id,
                'name': new_player.name,
                'player_number': new_player.player_number
            }
        })
    except Exception as e:
        db.session.rollback()
        print(f"Registration error: {str(e)}")
        return jsonify({'success': False, 'message': 'Registration failed. Please try again.'})

@app.route('/get_game_state')
def get_game_state():
    try:
        device_fingerprint = get_device_fingerprint()
        player_id = session.get('player_id')
        session_fingerprint = session.get('device_fingerprint')
        
        if not player_id:
            return jsonify({'success': False, 'message': 'Not registered'})
        
        # Verify device fingerprint matches
        if session_fingerprint != device_fingerprint:
            return jsonify({'success': False, 'message': 'Device mismatch. Please register from this device.'})
        
        player = Player.query.get(player_id)
        if not player or not player.game_state:
            return jsonify({'success': False, 'message': 'Player not found'})
        
        # Double-check device fingerprint in database
        if player.device_fingerprint != device_fingerprint:
            return jsonify({'success': False, 'message': 'This account belongs to a different device.'})
        
        return jsonify({
            'success': True,
            'player': {
                'name': player.name,
                'player_number': player.player_number
            },
            'game_state': {
                'first_roll': player.game_state.first_roll,
                'second_roll': player.game_state.second_roll,
                'score': player.game_state.score,
                'resets_used': player.game_state.resets_used,
                'rolls_remaining': player.game_state.rolls_remaining,
                'game_over': player.game_state.game_over
            }
        })
    except Exception as e:
        print(f"Get game state error: {str(e)}")
        return jsonify({'success': False, 'message': 'Error loading game state'})

@app.route('/roll_dice', methods=['POST'])
def roll_dice():
    try:
        device_fingerprint = get_device_fingerprint()
        player_id = session.get('player_id')
        session_fingerprint = session.get('device_fingerprint')
        
        if not player_id:
            return jsonify({'success': False, 'message': 'Not registered'})
        
        # Verify device fingerprint
        if session_fingerprint != device_fingerprint:
            return jsonify({'success': False, 'message': 'Device mismatch. Please register from this device.'})
        
        player = Player.query.get(player_id)
        if not player or not player.game_state:
            return jsonify({'success': False, 'message': 'Player not found'})
        
        # Double-check device fingerprint in database
        if player.device_fingerprint != device_fingerprint:
            return jsonify({'success': False, 'message': 'This account belongs to a different device.'})
        
        game_state = player.game_state
        
        if game_state.game_over:
            return jsonify({'success': False, 'message': 'Game is over! No more rolls allowed.'})
        
        if game_state.rolls_remaining <= 0:
            return jsonify({'success': False, 'message': 'No rolls remaining!'})
        
        # Roll dice (1-6)
        import random
        dice_value = random.randint(1, 6)
        
        # Update appropriate roll
        if game_state.first_roll == 0:
            game_state.first_roll = dice_value
        elif game_state.second_roll == 0:
            game_state.second_roll = dice_value
            # Calculate score when both rolls are done
            game_state.score = (game_state.first_roll * 10) + game_state.second_roll
        
        game_state.rolls_remaining -= 1
        
        # Check if game should end: resets_used >= 3 AND rolls_remaining <= 0
        if game_state.resets_used >= 3 and game_state.rolls_remaining <= 0:
            game_state.game_over = True
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'dice_value': dice_value,
            'first_roll': game_state.first_roll,
            'second_roll': game_state.second_roll,
            'score': game_state.score,
            'rolls_remaining': game_state.rolls_remaining,
            'game_over': game_state.game_over
        })
    except Exception as e:
        db.session.rollback()
        print(f"Roll dice error: {str(e)}")
        return jsonify({'success': False, 'message': 'Error rolling dice'})

@app.route('/reset_game', methods=['POST'])
def reset_game():
    try:
        device_fingerprint = get_device_fingerprint()
        player_id = session.get('player_id')
        session_fingerprint = session.get('device_fingerprint')
        
        if not player_id:
            return jsonify({'success': False, 'message': 'Not registered'})
        
        # Verify device fingerprint
        if session_fingerprint != device_fingerprint:
            return jsonify({'success': False, 'message': 'Device mismatch. Please register from this device.'})
        
        player = Player.query.get(player_id)
        if not player or not player.game_state:
            return jsonify({'success': False, 'message': 'Player not found'})
        
        # Double-check device fingerprint in database
        if player.device_fingerprint != device_fingerprint:
            return jsonify({'success': False, 'message': 'This account belongs to a different device.'})
        
        game_state = player.game_state
        
        if game_state.game_over:
            return jsonify({'success': False, 'message': 'Game is already over!'})
        
        if game_state.resets_used >= 3:
            return jsonify({'success': False, 'message': 'No resets remaining!'})
        
        if game_state.score == 0:
            return jsonify({'success': False, 'message': 'No score to reset!'})
        
        # Apply reset cost (5 points per reset)
        game_state.score = max(0, game_state.score - 5)
        game_state.resets_used += 1
        game_state.first_roll = 0
        game_state.second_roll = 0
        game_state.rolls_remaining = 2
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'score': game_state.score,
            'resets_used': game_state.resets_used,
            'first_roll': game_state.first_roll,
            'second_roll': game_state.second_roll,
            'rolls_remaining': game_state.rolls_remaining,
            'game_over': game_state.game_over,
            'message': f'Reset successful! -5 points. Resets remaining: {3 - game_state.resets_used}'
        })
    except Exception as e:
        db.session.rollback()
        print(f"Reset game error: {str(e)}")
        return jsonify({'success': False, 'message': 'Error resetting game'})

@app.route('/download_pdf', methods=['POST'])
def download_pdf():
    try:
        if not REPORTLAB_AVAILABLE:
            return jsonify({'success': False, 'message': 'PDF generation not available. reportlab not installed.'}), 500
        
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        
        # Register Bengali font
        try:
            pdfmetrics.registerFont(TTFont('Bengali', '/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf'))
        except:
            pass
        
        data = request.json
        name = data.get('name')
        number = data.get('number')
        score = data.get('score')
        
        # Create PDF in memory
        pdf_buffer = BytesIO()
        c = canvas.Canvas(pdf_buffer, pagesize=letter)
        width, height = letter
        
        # Margins
        margin = 50
        
	    # Title/Header
        c.setFont("Helvetica-Bold", 24)
        c.drawString(margin, height - 80, "SALAMI Lagbe 2026")
        
        # Horizontal line
        c.line(margin, height - 100, width - margin, height - 100)
        
        # Player message
        y_position = height - 150
        
        c.setFont("Helvetica", 14)
        c.drawString(margin, y_position, "Assalamualaikum vai,")
        
        y_position -= 30
        c.drawString(margin, y_position, f"I am {name}, Roll {number}")
        
        y_position -= 40
        c.drawString(margin, y_position, "Apnar kache Salami pabo:")
        
        y_position -= 50
        
        # Score in large font with light green color
        c.setFont("Helvetica-Bold", 48)
        c.setFillColor(colors.HexColor("#4CAF50"))
        c.drawString(margin, y_position, f"{score}")
        
        y_position -= 30
        
        # "taka" text
        c.setFont("Helvetica", 14)
        c.setFillColor(colors.black)
        c.drawString(margin, y_position, "Taka")
        
        y_position -= 40
        
        # Bengali message with Bengali font
        try:
            c.setFont("Bengali", 12)
            c.drawString(margin, y_position, "অনুগ্রহ করে পেমেন্ট করুন।")
        except:
            c.setFont("Helvetica", 12)
            c.drawString(margin, y_position, "Please provide the Salami.")
        
        # Reset font and color
        c.setFillColor(colors.black)
        
        y_position -= 100
        
        # Horizontal line before developer message
        c.line(margin, y_position, width - margin, y_position)
        
        y_position -= 20
        
        # Developer message (small text at bottom)
        c.setFont("Helvetica", 8)
        c.drawString(margin, y_position, "This is just a fun game for Unemployed kids. Nobody has to give you Salami based on the Score.")
        
        # Save and close
        c.save()
        pdf_buffer.seek(0)
        
        # Generate filename
        filename = f"{number}-{name}-salami2026.pdf"
        
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=filename
        )
        
    except Exception as e:
        print(f"PDF generation error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': f'Error generating PDF: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True)
