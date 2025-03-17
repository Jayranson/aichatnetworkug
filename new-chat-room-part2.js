// Handle context menu functionality
function handleContextMenu() {
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;
    
    // Add right-click event to user items
    document.querySelectorAll('.user-item').forEach(item => {
        item.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            
            // Get user data
            const userId = this.getAttribute('data-user-id');
            const username = this.getAttribute('data-username');
            selectedUserId = userId;
            
            // Position menu at cursor
            contextMenu.style.display = 'block';
            contextMenu.style.left = `${e.pageX}px`;
            contextMenu.style.top = `${e.pageY}px`;
            
            // Show/hide admin options based on user role
            const isAdmin = currentUser.roles && 
                (currentUser.roles.includes('admin') || currentUser.roles.includes('owner'));
            const isRoomOwner = currentRoom && currentRoom.owner === currentUser.id;
            const isRoomHost = currentRoom && currentRoom.hosts && 
                currentRoom.hosts.includes(currentUser.id);
            
            const kickOption = contextMenu.querySelector('.context-option[data-action="kick"]');
            const banOption = contextMenu.querySelector('.context-option[data-action="ban"]');
            
            if (kickOption) {
                kickOption.style.display = (isAdmin || isRoomOwner || isRoomHost) ? 'block' : 'none';
            }
            
            if (banOption) {
                banOption.style.display = (isAdmin || isRoomOwner || isRoomHost) ? 'block' : 'none';
            }
        });
    });
    
    // Hide context menu when clicking elsewhere
    document.addEventListener('click', function() {
        contextMenu.style.display = 'none';
    });
    
    // Add event listeners to context menu options
    const whisperOption = contextMenu.querySelector('.context-option[data-action="whisper"]');
    const profileOption = contextMenu.querySelector('.context-option[data-action="viewProfile"]');
    const muteOption = contextMenu.querySelector('.context-option[data-action="mute"]');
    const blockOption = contextMenu.querySelector('.context-option[data-action="block"]');
    const kickOption = contextMenu.querySelector('.context-option[data-action="kick"]');
    const banOption = contextMenu.querySelector('.context-option[data-action="ban"]');
    
    if (whisperOption) {
        whisperOption.addEventListener('click', function() {
            if (!selectedUserId) return;
            
            // Find user info
            const userItem = document.querySelector(`.user-item[data-user-id="${selectedUserId}"]`);
            if (userItem) {
                const username = userItem.getAttribute('data-username');
                openWhisperWindow({
                    id: selectedUserId,
                    username: username
                });
            }
            
            contextMenu.style.display = 'none';
        });
    }
    
    if (profileOption) {
        profileOption.addEventListener('click', function() {
            if (!selectedUserId) return;
            
            // Navigate to profile page
            window.location.href = `/profile?id=${selectedUserId}`;
            contextMenu.style.display = 'none';
        });
    }
    
    if (muteOption) {
        muteOption.addEventListener('click', function() {
            if (!selectedUserId) return;
            
            // Store muted users in local storage
            let mutedUsers = JSON.parse(localStorage.getItem('mutedUsers') || '[]');
            
            // Find user info
            const userItem = document.querySelector(`.user-item[data-user-id="${selectedUserId}"]`);
            if (!userItem) return;
            
            const username = userItem.getAttribute('data-username');
            
            // Add user to muted list if not already muted
            if (!mutedUsers.includes(selectedUserId)) {
                mutedUsers.push(selectedUserId);
                localStorage.setItem('mutedUsers', JSON.stringify(mutedUsers));
                showNotification(`You have muted ${username}`, 'info');
            } else {
                showNotification(`${username} is already muted`, 'info');
            }
            
            contextMenu.style.display = 'none';
        });
    }
    
    if (blockOption) {
        blockOption.addEventListener('click', function() {
            if (!selectedUserId) return;
            
            // Find user info
            const userItem = document.querySelector(`.user-item[data-user-id="${selectedUserId}"]`);
            if (!userItem) return;
            
            const username = userItem.getAttribute('data-username');
            
            // Call API to block user
            fetch(`/api/users/block`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({ userId: selectedUserId })
            })
            .then(response => {
                if (!response.ok) throw new Error('Failed to block user');
                return response.json();
            })
            .then(data => {
                showNotification(`You have blocked ${username}`, 'info');
            })
            .catch(error => {
                console.error('Error blocking user:', error);
                showNotification('Failed to block user. Please try again.', 'error');
            });
            
            contextMenu.style.display = 'none';
        });
    }
    
    if (kickOption) {
        kickOption.addEventListener('click', function() {
            if (!selectedUserId || !currentRoom) return;
            
            // Find user info
            const userItem = document.querySelector(`.user-item[data-user-id="${selectedUserId}"]`);
            if (!userItem) return;
            
            const username = userItem.getAttribute('data-username');
            
            const reason = prompt(`Reason for kicking ${username}:`);
            if (reason === null) return; // User canceled
            
            // Send kick command
            const message = `/kick ${username} ${reason}`;
            sendMessage(message);
            
            contextMenu.style.display = 'none';
        });
    }
    
    if (banOption) {
        banOption.addEventListener('click', function() {
            if (!selectedUserId || !currentRoom) return;
            
            // Find user info
            const userItem = document.querySelector(`.user-item[data-user-id="${selectedUserId}"]`);
            if (!userItem) return;
            
            const username = userItem.getAttribute('data-username');
            
            const reason = prompt(`Reason for banning ${username}:`);
            if (reason === null) return; // User canceled
            
            // Send ban command
            const message = `/ban ${username} ${reason}`;
            sendMessage(message);
            
            contextMenu.style.display = 'none';
        });
    }
}

// WebSocket connection
function connectWebSocket() {
    const token = getToken();
    if (!token) {
        showNotification('Authentication required. Please log in.', 'error');
        window.location.href = '/login';
        return;
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
    
    webSocket = new WebSocket(wsUrl);
    
    webSocket.onopen = function() {
        showNotification('Connected to chat server', 'success');
        reconnectAttempts = 0;
    };
    
    webSocket.onclose = function(event) {
        console.log('WebSocket closed with code:', event.code);
        
        if (event.code !== 1000) {
            // Abnormal closure, attempt to reconnect
            showNotification('Disconnected from server. Attempting to reconnect...', 'error');
            attemptReconnect();
        } else {
            showNotification('Disconnected from chat server', 'info');
        }
    };
    
    webSocket.onerror = function(error) {
        console.error('WebSocket error:', error);
        showNotification('Error connecting to chat server', 'error');
    };
    
    webSocket.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            processWebSocketMessage(data);
        } catch (e) {
            console.error('Error processing message:', e);
        }
    };
}

// Attempt to reconnect to WebSocket
function attemptReconnect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
        showNotification('Could not connect to server after multiple attempts. Please refresh the page.', 'error');
        return;
    }
    
    reconnectAttempts++;
    const delay = reconnectDelay * Math.pow(1.5, reconnectAttempts - 1); // Exponential backoff
    
    setTimeout(() => {
        showNotification(`Reconnecting (attempt ${reconnectAttempts})...`, 'info');
        connectWebSocket();
    }, delay);
}

// Process WebSocket messages
function processWebSocketMessage(data) {
    console.log('Received message:', data.type);
    
    switch (data.type) {
        case 'connected':
            // Successfully connected to WebSocket server
            showNotification(`Connected as ${data.user.username}`, 'success');
            break;
            
        case 'error':
            // Display error message
            showNotification(data.message, 'error');
            break;
            
        case 'message':
            // Regular chat message
            appendMessage(data);
            break;
            
        case 'whisper':
            // Received a whisper
            receiveWhisperMessage(data.from, data.message);
            break;
            
        case 'whisper_sent':
            // Confirmation of sent whisper
            // Already handled in sendWhisperMessage
            break;
            
        case 'user_joined':
            // User joined the room
            if (data.user && data.user.username) {
                showNotification(`${data.user.username} joined the room`, 'info');
                // Update members list if available
                updateRoomMembers();
            }
            break;
            
        case 'user_left':
            // User left the room
            updateRoomMembers();
            break;
            
        case 'room_joined':
            // Joined a room successfully
            currentRoom = data.room;
            showNotification(`Joined room: ${data.room.name}`, 'success');
            
            // Update UI elements
            updateRoomUI();
            break;
            
        case 'room_created':
            // Room created successfully
            showNotification(`Room created: ${data.room.name}`, 'success');
            
            // Auto-join created room
            joinRoom(data.room.id);
            
            // Close create room modal
            const createRoomModal = document.getElementById('createRoomModal');
            if (createRoomModal) {
                createRoomModal.style.display = 'none';
            }
            break;
            
        case 'room_updated':
            // Room settings updated
            if (currentRoom && currentRoom.id === data.roomId) {
                // Update local room data
                currentRoom.name = data.name;
                currentRoom.description = data.description;
                currentRoom.settings = data.settings;
                
                // Update UI elements
                updateRoomUI();
                
                showNotification('Room settings updated', 'success');
            }
            break;
            
        case 'user_kicked':
            // User was kicked
            showNotification(`${data.username} was kicked: ${data.reason}`, 'warning');
            break;
            
        case 'user_banned':
            // User was banned
            showNotification(`${data.username} was banned: ${data.reason}`, 'warning');
            break;
            
        case 'kicked':
            // You were kicked
            currentRoom = null;
            showNotification(`You were kicked from ${data.roomName}: ${data.reason}`, 'error');
            
            // Clear chat messages
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                messagesContainer.innerHTML = '';
            }
            
            // Redirect to rooms list
            setTimeout(() => {
                window.location.href = '/rooms';
            }, 3000);
            break;
            
        case 'banned':
            // You were banned
            currentRoom = null;
            showNotification(`You were banned from ${data.roomName}: ${data.reason}`, 'error');
            
            // Clear chat messages
            const messagesContainer = document.getElementById('messagesContainer');
            if (messagesContainer) {
                messagesContainer.innerHTML = '';
            }
            
            // Redirect to rooms list
            setTimeout(() => {
                window.location.href = '/rooms';
            }, 3000);
            break;
            
        case 'muted':
            // You were muted
            showNotification(`You have been muted for ${data.duration} minutes: ${data.reason}`, 'warning');
            break;
            
        case 'unmuted':
            // You were unmuted
            showNotification(`You are no longer muted in ${data.roomName}`, 'info');
            break;
            
        case 'server_announcement':
            // Server-wide announcement
            showNotification(`ANNOUNCEMENT: ${data.message}`, 'info');
            
            // Also append to chat
            appendSystemMessage(data.message, data.sender);
            break;
            
        case 'announcement':
            // Room announcement
            appendSystemMessage(data.message, data.sender);
            break;
            
        case 'poll_created':
            // New poll created
            appendPoll(data.poll);
            break;
            
        case 'poll_updated':
            // Poll votes updated
            updatePollVotes(data.pollId, data.votes);
            break;
            
        case 'chat_cleaned':
            // Chat was cleaned
            const msgContainer = document.getElementById('messagesContainer');
            if (msgContainer) {
                msgContainer.innerHTML = '';
                appendSystemMessage('The chat has been cleaned by a moderator.', 'System');
            }
            break;
            
        case 'slow_mode_updated':
            // Slow mode settings changed
            if (data.enabled) {
                showNotification(`Slow mode enabled. You can send messages every ${data.delay} seconds.`, 'info');
            } else {
                showNotification('Slow mode disabled.', 'info');
            }
            break;
            
        case 'room_settings_update_result':
            // Result of room settings update
            if (data.success) {
                showNotification('Room settings updated successfully', 'success');
                
                // Close room settings modal
                const roomSettingsModal = document.getElementById('roomSettingsModal');
                if (roomSettingsModal) {
                    roomSettingsModal.style.display = 'none';
                }
            } else {
                showNotification(`Failed to update room settings: ${data.message}`, 'error');
            }
            break;
            
        case 'command_response':
            // Response to a command
            if (data.message && data.sender) {
                showNotification(data.message, 'info');
            }
            break;
    }
}