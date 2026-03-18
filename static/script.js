let currentPlayer = null;
let isRolling = false;

// CORRECT mapping: dice value to CSS class
const diceRotations = {
    1: 'show-1',
    2: 'show-2',
    3: 'show-3',
    4: 'show-4',
    5: 'show-5',
    6: 'show-6'
};

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
    
    // Check if rolls are remaining before rolling
    if (rollBtn.disabled) {
        showMessage('No more rolls available!', 'error');
        return;
    }
    
    isRolling = true;
    rollBtn.disabled = true;
    
    // Remove all show-X classes before rolling
    dice.classList.remove('show-1', 'show-2', 'show-3', 'show-4', 'show-5', 'show-6', 'rolling');
    
    // Force reflow
    void dice.offsetWidth;
    
    // Fetch the roll result FIRST, before animation starts
    try {
        const response = await fetch('/roll_dice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const diceValue = data.dice_value || 1;
            
            // Start rolling animation
            dice.classList.add('rolling');
            
            // While rolling, show the dice value that will be the result
            // This makes it look like the dice is settling on that value
            setTimeout(() => {
                // After 700ms (before rolling animation ends at 1000ms),
                // show the final result so it "settles" on it
                dice.classList.remove('show-1', 'show-2', 'show-3', 'show-4', 'show-5', 'show-6');
                dice.classList.add(diceRotations[diceValue]);
            }, 700);
            
            // After animation completes
            setTimeout(() => {
                // Remove rolling animation
                dice.classList.remove('rolling');
                
                // Show roll success message
                showMessage(`You rolled a ${diceValue}!`, 'success');
                
                // Load fresh game state after roll to update everything
                loadGameState();
                
                isRolling = false;
            }, 1000);
        } else {
            showMessage(data.message || 'Roll failed', 'error');
            isRolling = false;
            loadGameState();
        }
    } catch (error) {
        console.error('Roll error:', error);
        showMessage('Connection error. Please try again.', 'error');
        isRolling = false;
        loadGameState();
    }
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
            // Show reset message with new score
            showMessage(`Reset used! New score: ${data.score}`, 'info');
            
            // Reset dice to default position
            const dice = document.getElementById('dice');
            dice.classList.remove('rolling', 'show-1', 'show-2', 'show-3', 'show-4', 'show-5', 'show-6');
            dice.classList.add('show-1');
            
            // Load fresh game state after reset
            loadGameState();
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
    
    // Update rolls remaining display - FIXED: only show remaining number
    // Just the number, not "0/2/2" format
    rollsRemainingDisplay.textContent = (gameState.rolls_remaining || 0);
    
    // Update dice display to show last rolled value
    if (gameState.second_roll && gameState.second_roll !== 0) {
        dice.classList.remove('rolling', 'show-1', 'show-2', 'show-3', 'show-4', 'show-5', 'show-6');
        dice.classList.add(diceRotations[gameState.second_roll]);
    } else if (gameState.first_roll && gameState.first_roll !== 0) {
        dice.classList.remove('rolling', 'show-1', 'show-2', 'show-3', 'show-4', 'show-5', 'show-6');
        dice.classList.add(diceRotations[gameState.first_roll]);
    } else {
        dice.classList.remove('rolling', 'show-1', 'show-2', 'show-3', 'show-4', 'show-5', 'show-6');
        dice.classList.add('show-1');
    }
    
    // BUTTON LOGIC
    
    // 1. Reset button disabled if: 3 resets used OR score is 0
    resetBtn.disabled = (gameState.resets_used >= 3) || (gameState.score <= 0);
    
    // 2. Roll button disabled if: no rolls remaining OR currently rolling
    rollBtn.disabled = (gameState.rolls_remaining <= 0) || isRolling;
    
    // 3. Show game over message only when both conditions are true AND not currently rolling
    const isGameOver = (gameState.resets_used >= 3) && (gameState.rolls_remaining <= 0);
    
    if (isGameOver && !isRolling) {
        rollBtn.disabled = true;
        resetBtn.disabled = true;
        showMessage('Game Over! Resets: 3/3 | Rolls: 0/2 | Final Score: ' + gameState.score, 'error');
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
