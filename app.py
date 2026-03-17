from flask import Flask, render_template, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = '7c36a7ad0427fdf03a38163fb94374b2723e102369b472497eca79397482e174'
database_url = os.environ.get('DATABASE_URL')
if database_url:
    # Fix for Render's postgres:// vs postgresql://
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
else:
    # Fallback to SQLite for local development
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///dicegame.db'

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Add these settings for better database connection handling
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    'pool_size': 5,
    'pool_recycle': 300,
    'pool_pre_ping': True,
    'connect_args': {
        'sslmode': 'require'  # Required for Supabase
    }
}

db = SQLAlchemy(app)
# Database Models
class Player(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    player_number = db.Column(db.String(20), nullable=False)
    ip_address = db.Column(db.String(50), unique=True, nullable=False)
    registration_date = db.Column(db.DateTime, default=datetime.utcnow)
    game_state = db.relationship('GameState', backref='player', uselist=False)

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
    data = request.json
    name = data.get('name')
    player_number = data.get('playerNumber')
    ip_address = request.remote_addr
    
    # Check if IP already registered
    existing_player = Player.query.filter_by(ip_address=ip_address).first()
    if existing_player:
        return jsonify({'success': False, 'message': 'This device has already registered!'})
    
    # Create new player
    new_player = Player(
        name=name,
        player_number=player_number,
        ip_address=ip_address
    )
    db.session.add(new_player)
    db.session.flush()
    
    # Create game state for player
    new_game_state = GameState(player_id=new_player.id)
    db.session.add(new_game_state)
    db.session.commit()
    
    session['player_id'] = new_player.id
    
    return jsonify({
        'success': True, 
        'message': 'Registration successful!',
        'player': {
            'id': new_player.id,
            'name': new_player.name,
            'player_number': new_player.player_number
        }
    })

@app.route('/get_game_state')
def get_game_state():
    if 'player_id' not in session:
        return jsonify({'success': False, 'message': 'Not registered'})
    
    player = Player.query.get(session['player_id'])
    if not player:
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

@app.route('/roll_dice', methods=['POST'])
def roll_dice():
    if 'player_id' not in session:
        return jsonify({'success': False, 'message': 'Not registered'})
    
    player = Player.query.get(session['player_id'])
    if not player:
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

@app.route('/reset_game', methods=['POST'])
def reset_game():
    if 'player_id' not in session:
        return jsonify({'success': False, 'message': 'Not registered'})
    
    player = Player.query.get(session['player_id'])
    if not player:
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
    
    # Check if game should end
    if game_state.resets_used >= 3:
        game_state.game_over = True
    
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

if __name__ == '__main__':
    app.run(debug=True)
