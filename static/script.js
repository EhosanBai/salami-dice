let currentPlayer = null;
let isRolling = false;
let lastGameOverShown = false;

const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

document.getElementById('registration-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('name').value.trim();
    const playerNumber = document.getElementById('player-number').value.trim();
    
    if (!name || !playerNumber) {
        showMessage('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch('/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, playerNumber })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage('Registration successful!', 'success');
            setTimeout(() => {
                document.getElementById('registration-section').style.display = 'none';
                document.getElementById('game-section').style.display = 'block';
                document.getElementById('player-name').textContent = data.player.name;
                document.getElementById('player-number-display').textContent = data.player.player_number;
                currentPlayer = data.player;
                loadGameState();
            }, 500);
        } else {
            showMessage(data.message || 'Registration failed', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showMessage('Connection error. Please try again.', 'error');
    }
});

async function loadGameState() {
    try {
        const response = await fetch('/get_game_state');
        const data = await response.json();
        
        if (data.success) {
            currentPlayer = data.player;
            updateGameDisplay(data.game_state);
        }
    } catch (error) {
        console.error('Error loading game state:', error);
    }
}

document.getElementById('roll-btn').addEventListener('click', async () => {
    if (isRolling) return;
    
    const dice = document.getElementById('dice');
    const rollBtn = document.getElementById('roll-btn');
    
    isRolling = true;
    rollBtn.disabled = true;
    
    // Clear any previous game over message when rolling
    lastGameOverShown = false;
    
    dice.classList.add('rolling');
    
    const rollInterval = setInterval(() => {
        const randomFace = diceFaces[Math.floor(Math.random() * diceFaces.length)];
        dice.textContent = randomFace;
    }, 50);
    
    setTimeout(async () => {
        clearInterval(rollInterval);
        
        try {
            const response = await fetch('/roll_dice', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            const data = await response.json();
            dice.classList.remove('rolling');
            
            if (data.success) {
                setTimeout(() => {
                    const diceValue = data.dice_value || 1;
                    dice.textContent = diceFaces[diceValue - 1];
                    
                    // Load fresh game state after roll to update everything
                    loadGameState();
                    showMessage(`You rolled a ${diceValue}!`, 'success');
                    
                    isRolling = false;
                }, 100);
            } else {
                dice.classList.remove('rolling');
                showMessage(data.message || 'Roll failed', 'error');
                isRolling = false;
                
                // Reload game state on error
                loadGameState();
            }
        } catch (error) {
            console.error('Roll error:', error);
            dice.classList.remove('rolling');
            showMessage('Connection error. Please try again.', 'error');
            isRolling = false;
            
            // Reload game state on error
            loadGameState();
        }
    }, 800);
});

document.getElementById('reset-btn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset? This will cost 5 points!')) {
        return;
    }
    
    const resetBtn = document.getElementById('reset-btn');
    resetBtn.disabled = true;
    
    try {
        const response = await fetch('/reset_game', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Load fresh game state after reset
            loadGameState();
            showMessage(`Reset used! New score: ${data.score}`, 'info');
            document.getElementById('dice').textContent = '🎲';
        } else {
            showMessage(data.message || 'Reset failed', 'error');
            resetBtn.disabled = false;
        }
    } catch (error) {
        console.error('Reset error:', error);
        showMessage('Connection error. Please try again.', 'error');
        resetBtn.disabled = false;
    }
});

function updateGameDisplay(gameState) {
    const firstBox = document.getElementById('first-box');
    const secondBox = document.getElementById('second-box');
    const scoreDisplay = document.getElementById('score');
    const resetsUsedDisplay = document.getElementById('resets-used');
    const rollsRemainingDisplay = document.getElementById('rolls-remaining');
    const rollBtn = document.getElementById('roll-btn');
    const resetBtn = document.getElementById('reset-btn');
    const dice = document.getElementById('dice');
    
    // Update first box (10th position)
    if (gameState.first_roll && gameState.first_roll !== 0) {
        if (firstBox.textContent !== String(gameState.first_roll)) {
            firstBox.textContent = gameState.first_roll;
            firstBox.classList.remove('filled');
            void firstBox.offsetWidth;
            firstBox.classList.add('filled');
        }
    } else {
        firstBox.textContent = '-';
        firstBox.classList.remove('filled');
    }
    
    // Update second box (1st position)
    if (gameState.second_roll && gameState.second_roll !== 0) {
        if (secondBox.textContent !== String(gameState.second_roll)) {
            secondBox.textContent = gameState.second_roll;
            secondBox.classList.remove('filled');
            void secondBox.offsetWidth;
            secondBox.classList.add('filled');
        }
    } else {
        secondBox.textContent = '-';
        secondBox.classList.remove('filled');
    }
    
    // Update score display
    scoreDisplay.textContent = gameState.score || 0;
    
    // Update resets used display
    resetsUsedDisplay.textContent = gameState.resets_used || 0;
    
    // Update rolls remaining display with /2 format
    rollsRemainingDisplay.textContent = (gameState.rolls_remaining || 0) + '/2';
    
    // Update dice display
    if (gameState.second_roll && gameState.second_roll !== 0) {
        dice.textContent = diceFaces[gameState.second_roll - 1];
    } else if (gameState.first_roll && gameState.first_roll !== 0) {
        dice.textContent = diceFaces[gameState.first_roll - 1];
    } else {
        dice.textContent = '🎲';
    }
    
    // BUTTON LOGIC
    // After 3rd reset used (resets_used >= 3): Reset button DISABLED, Roll button ENABLED (if rolls > 0)
    // When rolls_remaining <= 0: Roll button DISABLED
    // Game over: when resets_used >= 3 AND rolls_remaining <= 0
    
    // Disable reset button if 3 resets already used OR score is 0
    resetBtn.disabled = (gameState.resets_used >= 3) || (gameState.score <= 0);
    
    // Disable roll button if no rolls remaining OR already rolling
    rollBtn.disabled = (gameState.rolls_remaining <= 0) || isRolling;
    
    // Check if game is completely over
    const isGameOver = (gameState.resets_used >= 3) && (gameState.rolls_remaining <= 0);
    
    // Only show game over message once, and only if actually game over
    if (isGameOver && !lastGameOverShown && !isRolling) {
        lastGameOverShown = true;
        rollBtn.disabled = true;
        resetBtn.disabled = true;
        showMessage('Game Over! Resets: 3/3 | Rolls: 0/2 | Final Score: ' + gameState.score, 'error');
    } else if (!isGameOver) {
        // Reset the flag if game is not over
        lastGameOverShown = false;
    }
}

function showMessage(message, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}`;
    
    setTimeout(() => {
        messageDiv.textContent = '';
        messageDiv.className = 'message';
    }, 5000);
}

window.addEventListener('load', async () => {
    try {
        const response = await fetch('/get_game_state');
        const data = await response.json();
        
        if (data.success && data.player) {
            document.getElementById('registration-section').style.display = 'none';
            document.getElementById('game-section').style.display = 'block';
            document.getElementById('player-name').textContent = data.player.name;
            document.getElementById('player-number-display').textContent = data.player.player_number;
            currentPlayer = data.player;
            updateGameDisplay(data.game_state);
        } else {
            document.getElementById('registration-section').style.display = 'block';
            document.getElementById('game-section').style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking registration status:', error);
        document.getElementById('registration-section').style.display = 'block';
        document.getElementById('game-section').style.display = 'none';
    }
});
