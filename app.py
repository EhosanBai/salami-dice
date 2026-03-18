from flask import Flask, render_template, request, jsonify, session, send_file
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors

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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/register', methods=['POST'])
def register():
    try:
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
        
        # Create new player
        new_player = Player(
            name=name,
            player_number=player_number
        )
        db.session.add(new_player)
        db.session.flush()
        
        # Create game state for player
        new_game_state = GameState(player_id=new_player.id)
        db.session.add(new_game_state)
        db.session.commit()
        
        # Store player ID in session
        session['player_id'] = new_player.id
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
        player_id = session.get('player_id')
        
        if not player_id:
            return jsonify({'success': False, 'message': 'Not registered'})
        
        player = Player.query.get(player_id)
        if not player or not player.game_state:
            return jsonify({'success': False, 'message': 'Player not found'})
        
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
        player_id = session.get('player_id')
        
        if not player_id:
            return jsonify({'success': False, 'message': 'Not registered'})
        
        player = Player.query.get(player_id)
        if not player or not player.game_state:
            return jsonify({'success': False, 'message': 'Player not found'})
        
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
        player_id = session.get('player_id')
        
        if not player_id:
            return jsonify({'success': False, 'message': 'Not registered'})
        
        player = Player.query.get(player_id)
        if not player or not player.game_state:
            return jsonify({'success': False, 'message': 'Player not found'})
        
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
        c.drawString(margin, height - 80, "SALAMI 2026")
        
        # Horizontal line
        c.line(margin, height - 100, width - margin, height - 100)
        
        # Player message
        y_position = height - 140
        
        c.setFont("Helvetica", 14)
        c.drawString(margin, y_position, "আসসালামু আলাইকুম ভাই,")
        
        y_position -= 30
        c.drawString(margin, y_position, f"আমি {name}, রোল {number}")
        
        y_position -= 40
        c.drawString(margin, y_position, "আপনার থেকে")
        
        y_position -= 50
        
        # Score in large font with light green color
        c.setFont("Helvetica-Bold", 48)
        c.setFillColor(colors.HexColor("#4CAF50"))
        c.drawString(margin, y_position, f"{score}")
        
        y_position -= 60
        
        # "taka" text with Bengali
        c.setFont("Helvetica", 14)
        c.setFillColor(colors.black)
        c.drawString(margin, y_position, "টাকা")
        
        y_position -= 40
        c.drawString(margin, y_position, "সালামি পাই।")
        
        y_position -= 30
        c.drawString(margin, y_position, "অনুগ্রহ করে দিয়ে দিন।")
        
        # Reset font and color
        c.setFillColor(colors.black)
        
        y_position -= 100
        
        # Horizontal line before developer message
        c.line(margin, y_position, width - margin, y_position)
        
        y_position -= 30
        
        # Developer message (small text at bottom)
        c.setFont("Helvetica", 8)
        c.drawString(margin, y_position, "এটা বেকার পোলাপানের সময় নষ্ট করার জন্য তৈরি। কেউ তোমাকে সালামি দিতে বাধ্য নয়।")
        
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
