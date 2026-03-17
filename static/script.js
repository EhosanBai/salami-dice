let currentPlayer = null;

document.getElementById('registration-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('name').value;
    const playerNumber = document.getElementById('player-number').value;
    
    const response = await fetch('/register', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, playerNumber })
    });
    
    const data = await response.json();
    
    if (data.success) {
        document.getElementById('registration-section').style.display = 'none';
        document.getElementById('game-section').style.display = 'block';
        document.getElementById('player-name').textContent = data.player.name;
        document.getElementById('player-number-display').textContent = data.player.player_number;
        currentPlayer = data.player;
        loadGameState();
    } else {
        alert(data.message);
    }
});

async function loadGameState() {
    const response = await fetch('/get_game_state');
    const data = await response.json();
    
    if (data.success) {
        updateGameDisplay(data.game_state);
    }
}

document.getElementById('roll-btn').addEventListener('click', async () => {
    const dice = document.getElementById('dice');
    dice.classList.add('rolling');
    
    setTimeout(async () => {
        const response = await fetch('/roll_dice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        dice.classList.remove('rolling');
        
        if (data.success) {
            updateGameDisplay(data);
            showMessage(`You rolled a ${data.dice_value}!`, 'success');
        } else {
            showMessage(data.message, 'error');
        }
    }, 500);
});

document.getElementById('reset-btn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset? This will cost 5 points!')) {
        return;
    }
    
    const response = await fetch('/reset_game', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    });
    
    const data = await response.json();
    
    if (data.success) {
        updateGameDisplay(data);
        showMessage(data.message, 'info');
    } else {
        showMessage(data.message, 'error');
    }
});

function updateGameDisplay(gameState) {
    document.getElementById('first-box').textContent = gameState.first_roll || '-';
    document.getElementById('second-box').textContent = gameState.second_roll || '-';
    document.getElementById('score').textContent = gameState.score || 0;
    document.getElementById('resets-used').textContent = gameState.resets_used || 0;
    document.getElementById('rolls-remaining').textContent = gameState.rolls_remaining || 0;
    
    // Update dice display based on last roll
    if (gameState.second_roll && gameState.second_roll !== 0) {
        document.getElementById('dice').textContent = getDiceFace(gameState.second_roll);
    } else if (gameState.first_roll && gameState.first_roll !== 0) {
        document.getElementById('dice').textContent = getDiceFace(gameState.first_roll);
    }
    
    // Disable buttons if game over
    if (gameState.game_over) {
        document.getElementById('roll-btn').disabled = true;
        document.getElementById('reset-btn').disabled = true;
        showMessage('Game Over! No more moves allowed.', 'info');
    }
    
    // Disable roll button if no rolls remaining
    if (gameState.rolls_remaining <= 0) {
        document.getElementById('roll-btn').disabled = true;
    } else {
        document.getElementById('roll-btn').disabled = false;
    }
    
    // Disable reset button if no resets remaining or no score
    if (gameState.resets_used >= 3 || gameState.score === 0) {
        document.getElementById('reset-btn').disabled = true;
    } else {
        document.getElementById('reset-btn').disabled = false;
    }
}

function getDiceFace(value) {
    const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    return diceFaces[value - 1] || '🎲';
}

function showMessage(message, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}`;
    
    setTimeout(() => {
        messageDiv.textContent = '';
        messageDiv.className = 'message';
    }, 3000);
}

// Check if user is already registered on page load
window.addEventListener('load', async () => {
    const response = await fetch('/get_game_state');
    const data = await response.json();
    
    if (data.success) {
        document.getElementById('registration-section').style.display = 'none';
        document.getElementById('game-section').style.display = 'block';
        document.getElementById('player-name').textContent = data.player.name;
        document.getElementById('player-number-display').textContent = data.player.player_number;
        currentPlayer = data.player;
        updateGameDisplay(data.game_state);
    }
});
