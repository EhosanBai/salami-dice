from flask import Flask, render_template, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
import os
import random

app = Flask(__name__)
app.config['SECRET_KEY'] = '7c36a7ad0427fdf03a38163fb94374b2723e102369b472497eca79397482e174'
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///dicegame.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['PERMANENT_SESSION_LIFETIME'] = 3600 * 24 * 7   # 7 days — optional

db = SQLAlchemy(app)

# ────────────────────────────────────────────────
# Models (unchanged, but keeping for completeness)
# ────────────────────────────────────────────────

class Player(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    player_number = db.Column(db.String(20), nullable=False)
    registration_date = db.Column(db.DateTime, default=datetime.utcnow)
    game_state = db.relationship('GameState', backref='player', uselist=False)

class GameState(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    player_id = db.Column(db.Integer, db.ForeignKey('player.id'), unique=True)
    first_roll  = db.Column(db.Integer, default=0)
    second_roll = db.Column(db.Integer, default=0)
    score       = db.Column(db.Integer, default=0)
    resets_used = db.Column(db.Integer, default=0)
    rolls_remaining = db.Column(db.Integer, default=2)
    game_over   = db.Column(db.Boolean, default=False)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

with app.app_context():
    db.create_all()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    name = data.get('name', '').strip()
    player_number = data.get('playerNumber', '').strip()   # ← note the key name

    if not name or not player_number:
        return jsonify({'success': False, 'message': 'Name and roll number are required'})

    # ─── Removed IP check ────────────────────────────────
    # No longer blocking by IP

    # Optional: you could add simple duplicate name check (not perfect)
    # existing = Player.query.filter_by(name=name, player_number=player_number).first()
    # if existing:
    #     return jsonify({'success': False, 'message': 'This name + number combination is already taken'})

    new_player = Player(
        name=name,
        player_number=player_number
        # ip_address removed from model too — see below
    )
    db.session.add(new_player)
    db.session.flush()

    new_game_state = GameState(player_id=new_player.id)
    db.session.add(new_game_state)
    db.session.commit()

    session['player_id'] = new_player.id
    session.permanent = True   # optional

    return jsonify({
        'success': True,
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
        session.pop('player_id', None)
        return jsonify({'success': False, 'message': 'Session invalid — please register again'})

    gs = player.game_state
    return jsonify({
        'success': True,
        'player': {
            'name': player.name,
            'player_number': player.player_number
        },
        'game_state': {
            'first_roll': gs.first_roll,
            'second_roll': gs.second_roll,
            'score': gs.score,
            'resets_used': gs.resets_used,
            'rolls_remaining': gs.rolls_remaining,
            'game_over': gs.game_over
        }
    })

# The other routes (/roll_dice, /reset_game) remain unchanged
# ... paste them here if needed ...

if __name__ == '__main__':
    app.run(debug=True)
