// Create a new room
function createNewRoom() {
    const roomName = document.getElementById('roomName').value.trim();
    const roomDescription = document.getElementById('roomDescription').value.trim();
    const isPrivate = document.getElementById('roomPrivate').checked;
    const password = isPrivate ? document.getElementById('roomPassword').value : null;
    
    if (!roomName) {
        showNotification('Room name is required', 'error');
        return;
    }
    
    const roomData = {
        name: roomName,
        description: roomDescription,
        isPrivate: isPrivate,
        password: password,
        allowGuests: document.getElementById('allowGuests')?.checked || true,
        aiEnabled: document.getElementById('enableAI')?.checked || true,
        slowMode: document.getElementById('enableSlowMode')?.checked || false,
        slowModeDelay: parseInt(document.getElementById('slowModeDelay')?.value || '5')
    };
    
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({
            type: 'create_room',
            roomData: roomData
        }));
        
        // Reset form
        document.getElementById('createRoomForm').reset();
    } else {
        showNotification('Not connected to server. Cannot create room.', 'error');
        connectWebSocket();
    }
}

// Show room settings
function showRoomSettings() {
    if (!currentRoom) {
        showNotification('No room selected', 'error');
        return;
    }
    
    // Populate form with current room settings
    document.getElementById('updateRoomName').value = currentRoom.name || '';
    document.getElementById('updateRoomDescription').value = currentRoom.description || '';
    document.getElementById('updateRoomPrivate').checked = currentRoom.isPrivate || false;
    document.getElementById('updateRoomPassword').value = '';
    
    // Show/hide password field based on private checkbox
    document.getElementById('updatePasswordField').style.display = 
        currentRoom.isPrivate ? 'block' : 'none';
    
    if (currentRoom.settings) {
        document.getElementById('allowGuests').checked = currentRoom.settings.allowGuests || false;
        document.getElementById('enableAI').checked = currentRoom.settings.aiEnabled || false;
        document.getElementById('enableSlowMode').checked = currentRoom.settings.slowMode || false;
        document.getElementById('slowModeDelay').value = currentRoom.settings.slowModeDelay || 5;
    }
    
    // Show modal
    const roomSettingsModal = document.getElementById('roomSettingsModal');
    if (roomSettingsModal) {
        roomSettingsModal.style.display = 'flex';
    }
}

// Update room settings
function updateRoomSettings() {
    if (!currentRoom) {
        showNotification('No room selected', 'error');
        return;
    }
    
    const name = document.getElementById('updateRoomName').value.trim();
    const description = document.getElementById('updateRoomDescription').value.trim();
    const isPrivate = document.getElementById('updateRoomPrivate').checked;
    const password = isPrivate ? document.getElementById('updateRoomPassword').value : null;
    const allowGuests = document.getElementById('allowGuests').checked;
    const aiEnabled = document.getElementById('enableAI').checked;
    const slowMode = document.getElementById('enableSlowMode').checked;
    const slowModeDelay = parseInt(document.getElementById('slowModeDelay').value) || 5;
    
    if (!name) {
        showNotification('Room name is required', 'error');
        return;
    }
    
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({
            type: 'update_room_settings',
            roomId: currentRoom.id,
            settings: {
                name: name,
                description: description,
                isPrivate: isPrivate,
                password: password,
                allowGuests: allowGuests,
                aiEnabled: aiEnabled,
                slowMode: slowMode,
                slowModeDelay: slowModeDelay
            }
        }));
    } else {
        showNotification('Not connected to server. Cannot update settings.', 'error');
        connectWebSocket();
    }
}

// Whisper window functionality
function openWhisperWindow(user) {
    // Check if window already exists for this user
    const existingWindow = document.getElementById(`whisper-${user.id}`);
    if (existingWindow) {
        // Focus existing window
        existingWindow.style.opacity = '1';
        existingWindow.querySelector('.whisper-input').focus();
        return;
    }
    
    // Create new whisper window
    const whisperWindow = document.createElement('div');
    whisperWindow.id = `whisper-${user.id}`;
    whisperWindow.className = 'whisper-window';
    whisperWindow.dataset.userId = user.id;
    whisperWindow.dataset.username = user.username;
    
    // Create window structure
    whisperWindow.innerHTML = `
        <div class="whisper-header">
            <div class="whisper-title">Whisper: ${user.username}</div>
            <button class="whisper-close">&times;</button>
        </div>
        <div class="whisper-messages"></div>
        <div class="whisper-input-container">
            <textarea class="whisper-input" placeholder="Type your message..."></textarea>
            <button class="whisper-send">Send</button>
        </div>
    `;
    
    // Add window to container
    document.getElementById('whisperWindows').appendChild(whisperWindow);
    
    // Make window draggable
    makeWhisperWindowDraggable(whisperWindow);
    
    // Add event listeners
    const closeBtn = whisperWindow.querySelector('.whisper-close');
    const sendBtn = whisperWindow.querySelector('.whisper-send');
    const input = whisperWindow.querySelector('.whisper-input');
    
    closeBtn.addEventListener('click', () => {
        whisperWindow.remove();
    });
    
    sendBtn.addEventListener('click', () => {
        sendWhisperMessage(user.id, input.value.trim());
        input.value = '';
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });
    
    // Focus input
    input.focus();
}

// Send whisper message
function sendWhisperMessage(targetId, message) {
    if (!message) return;
    
    const whisperWindow = document.getElementById(`whisper-${targetId}`);
    if (!whisperWindow) return;
    
    const messagesContainer = whisperWindow.querySelector('.whisper-messages');
    
    // Add message to the window
    const messageElement = document.createElement('div');
    messageElement.className = 'whisper-message sent';
    
    const timestamp = new Date();
    const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageElement.innerHTML = `
        <div>${message}</div>
        <div class="whisper-timestamp">${timeString}</div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Send message to server
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({
            type: 'whisper',
            targetId: targetId,
            content: message
        }));
    } else {
        showNotification('Not connected to server. Whisper not sent.', 'error');
        connectWebSocket();
    }
}

// Receive whisper message
function receiveWhisperMessage(fromUser, message) {
    // Create whisper window if it doesn't exist
    let whisperWindow = document.getElementById(`whisper-${fromUser.id}`);
    if (!whisperWindow) {
        openWhisperWindow(fromUser);
        whisperWindow = document.getElementById(`whisper-${fromUser.id}`);
        
        // Play notification sound
        playNotificationSound();
    }
    
    const messagesContainer = whisperWindow.querySelector('.whisper-messages');
    
    // Add message to the window
    const messageElement = document.createElement('div');
    messageElement.className = 'whisper-message received';
    
    const timestamp = new Date();
    const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageElement.innerHTML = `
        <div>${message}</div>
        <div class="whisper-timestamp">${timeString}</div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Show notification if window is not focused
    if (document.visibilityState !== 'visible') {
        showBrowserNotification(`New whisper from ${fromUser.username}`, message);
    }
}

// Make whisper window draggable
function makeWhisperWindowDraggable(window) {
    const header = window.querySelector('.whisper-header');
    let isDragging = false;
    let offsetX, offsetY;
    
    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - window.getBoundingClientRect().left;
        offsetY = e.clientY - window.getBoundingClientRect().top;
        window.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;
        
        // Limit to viewport
        const maxX = document.documentElement.clientWidth - window.offsetWidth;
        const maxY = document.documentElement.clientHeight - window.offsetHeight;
        
        window.style.left = `${Math.max(0, Math.min(maxX, x))}px`;
        window.style.top = `${Math.max(0, Math.min(maxY, y))}px`;
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            window.style.cursor = '';
        }
    });
}

// Check if user is typing
let typingTimeout = null;

function userIsTyping() {
    if (!currentRoom) return;
    
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({
            type: 'typing',
            roomId: currentRoom.id,
            isTyping: true
        }));
    }
    
    // Clear previous timeout
    if (typingTimeout) {
        clearTimeout(typingTimeout);
    }
    
    // Set new timeout
    typingTimeout = setTimeout(() => {
        stopTyping();
    }, TYPING_TIMEOUT);
}

function stopTyping() {
    if (!currentRoom) return;
    
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({
            type: 'typing',
            roomId: currentRoom.id,
            isTyping: false
        }));
    }
}

// Logout function
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('currentUser');
    window.location.href = '/login';
}

// Export functions and variables for global access
window.currentRoom = currentRoom;
window.sendMessage = sendMessage;
window.joinRoom = joinRoom;
window.leaveCurrentRoom = leaveCurrentRoom;
window.createNewRoom = createNewRoom;
window.updateRoomSettings = updateRoomSettings;
window.openWhisperWindow = openWhisperWindow;
window.logout = logout;