let currentPlayer = null;
let isRolling = false;

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
                    
                    // Load fresh game state after roll
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
    const rollBtn = document.getElementById('roll-btn');
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
            await loadGameState();
            showMessage(`Reset used! New score: ${data.score}`, 'info');
            document.getElementById('dice').textContent = '🎲';
            
            // Check if this was the 3rd reset
            if (data.resets_used >= 3) {
                showMessage('3 resets used! Game is now over. You cannot reset anymore.', 'error');
                resetBtn.disabled = true;
                rollBtn.disabled = true;
            }
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
    
    // Update rolls remaining display
    rollsRemainingDisplay.textContent = gameState.rolls_remaining || 0;
    
    // Update dice display
    if (gameState.second_roll && gameState.second_roll !== 0) {
        dice.textContent = diceFaces[gameState.second_roll - 1];
    } else if (gameState.first_roll && gameState.first_roll !== 0) {
        dice.textContent = diceFaces[gameState.first_roll - 1];
    } else {
        dice.textContent = '🎲';
    }
    
    // Button disable logic - KEY FIX
    // Player can roll if: they have rolls remaining AND resets used is less than 3
    // Player can reset if: they have used less than 3 resets AND they have a score
    
    if (gameState.resets_used >= 3) {
        // All resets used - game is over
        rollBtn.disabled = true;
        resetBtn.disabled = true;
        showMessage('Game Over! You have used all 3 resets. No more moves allowed.', 'error');
    } else if (gameState.game_over) {
        // Game ended for another reason
        rollBtn.disabled = true;
        resetBtn.disabled = true;
        showMessage('Game Over! No more moves allowed.', 'info');
    } else {
        // Game is still active
        // Can roll if rolls remaining > 0
        rollBtn.disabled = (gameState.rolls_remaining <= 0) || isRolling;
        
        // Can reset if score > 0 and resets < 3
        resetBtn.disabled = (gameState.resets_used >= 3) || (gameState.score <= 0);
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
