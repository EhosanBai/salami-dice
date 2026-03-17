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
                    updateGameDisplay(data);
                    showMessage(`You rolled a ${diceValue}!`, 'success');
                    
                    isRolling = false;
                    if (data.rolls_remaining > 0 && !data.game_over) {
                        rollBtn.disabled = false;
                    } else {
                        rollBtn.disabled = true;
                    }
                }, 100);
            } else {
                dice.classList.remove('rolling');
                showMessage(data.message || 'Roll failed', 'error');
                isRolling = false;
                rollBtn.disabled = false;
            }
        } catch (error) {
            console.error('Roll error:', error);
            dice.classList.remove('rolling');
            showMessage('Connection error. Please try again.', 'error');
            isRolling = false;
            rollBtn.disabled = false;
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
            loadGameState();
            showMessage(`Reset used! New score: ${data.score}. Resets used: ${data.resets_used}/3`, 'info');
            document.getElementById('dice').textContent = '🎲';
            
            if (data.resets_used >= 3) {
                document.getElementById('roll-btn').disabled = true;
                resetBtn.disabled = true;
                showMessage('Game Over! You have used all 3 resets.', 'error');
            } else {
                resetBtn.disabled = false;
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
    const rollBtn = document.getElementById('roll-btn');
    const resetBtn = document.getElementById('reset-btn');
    const dice = document.getElementById('dice');
    
    // Update first box
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
    
    // Update second box
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
    
    // Update score and resets
    scoreDisplay.textContent = gameState.score || 0;
    resetsUsedDisplay.textContent = gameState.resets_used || 0;
    
    // Update dice display
    if (gameState.second_roll && gameState.second_roll !== 0) {
        dice.textContent = diceFaces[gameState.second_roll - 1];
    } else if (gameState.first_roll && gameState.first_roll !== 0) {
        dice.textContent = diceFaces[gameState.first_roll - 1];
    } else {
        dice.textContent = '🎲';
    }
    
    // Check if game is over
    if (gameState.game_over || gameState.resets_used >= 3) {
        rollBtn.disabled = true;
        resetBtn.disabled = true;
        if (gameState.resets_used >= 3) {
            showMessage('Game Over! You have used all 3 resets.', 'error');
        } else {
            showMessage('Game Over! No more moves allowed.', 'info');
        }
    } else {
        // Enable/disable roll button
        if (gameState.rolls_remaining > 0 && !isRolling) {
            rollBtn.disabled = false;
        } else {
            rollBtn.disabled = true;
        }
        
        // Enable/disable reset button
        if (gameState.resets_used >= 3 || gameState.score === 0) {
            resetBtn.disabled = true;
        } else {
            resetBtn.disabled = false;
        }
    }
}

function showMessage(message, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = message;
    messageDiv.className = `message ${type}`;
    
    setTimeout(() => {
        messageDiv.textContent = '';
        messageDiv.className = 'message';
    }, 4000);
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
