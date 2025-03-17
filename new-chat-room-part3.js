// Update Room UI elements
function updateRoomUI() {
    if (!currentRoom) return;
    
    // Update room title
    const roomTitle = document.getElementById('roomTitle');
    if (roomTitle) {
        roomTitle.textContent = currentRoom.name;
    }
    
    // Update room description
    const roomDescription = document.getElementById('roomDescription');
    if (roomDescription) {
        roomDescription.textContent = currentRoom.description || 'No description';
    }
    
    // Clear chat messages
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
    }
    
    // Update members list
    updateRoomMembers();
}

// Update room members list
function updateRoomMembers() {
    if (!currentRoom || !currentRoom.id) return;
    
    // Request updated members list
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({
            type: 'get_room_members',
            roomId: currentRoom.id
        }));
    }
}

// Render room members
function renderRoomMembers(members) {
    const membersList = document.getElementById('membersList');
    if (!membersList) return;
    
    // Clear existing list
    membersList.innerHTML = '';
    
    // Keep track of processed members to avoid duplicates
    const processedMembers = new Set();
    
    members.forEach(member => {
        if (processedMembers.has(member.id)) return;
        processedMembers.add(member.id);
        
        const memberItem = document.createElement('div');
        memberItem.className = 'user-item';
        memberItem.dataset.userId = member.id;
        memberItem.dataset.username = member.username;
        
        let roleIcon = '';
        if (member.isOwner) roleIcon = '<span class="role-icon owner">⭐</span>';
        else if (member.isHost) roleIcon = '<span class="role-icon host">🛡️</span>';
        
        // Add admin crown
        if (member.roles && (member.roles.includes('admin') || member.roles.includes('owner'))) {
            roleIcon = '<span class="role-icon admin">👑</span>';
            memberItem.dataset.isAdmin = 'true';
        }
        
        memberItem.innerHTML = `
            <div class="user-avatar">
                <img src="${member.avatar || '/img/default-avatar.png'}" alt="${member.username}">
                <span class="user-status ${member.status || 'online'}"></span>
            </div>
            <div class="user-info">
                <div class="user-name">${roleIcon} ${member.username}</div>
            </div>
        `;
        
        membersList.appendChild(memberItem);
    });
    
    // Reattach context menu handlers
    handleContextMenu();
}

// Send a message
function sendMessage(message = null) {
    if (!currentRoom) {
        showNotification('You must join a room first', 'error');
        return;
    }
    
    // Get message from input if not provided
    if (!message) {
        const messageInput = document.getElementById('messageInput');
        if (!messageInput) return;
        
        message = messageInput.value.trim();
        
        if (!message) return;
        
        // Clear input after sending
        messageInput.value = '';
    }
    
    // Check for slow mode
    if (currentRoom.settings && currentRoom.settings.slowMode) {
        const now = Date.now();
        const lastMessageTime = lastMessageTimes[currentRoom.id] || 0;
        const cooldown = (currentRoom.settings.slowModeDelay || 5) * 1000;
        
        if (now - lastMessageTime < cooldown) {
            const remainingTime = Math.ceil((cooldown - (now - lastMessageTime)) / 1000);
            showNotification(`Slow mode is enabled. Please wait ${remainingTime} seconds before sending another message.`, 'error');
            return;
        }
        
        // Update last message time
        lastMessageTimes[currentRoom.id] = now;
    }
    
    // Send message to WebSocket server
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({
            type: 'message',
            roomId: currentRoom.id,
            content: message
        }));
    } else {
        showNotification('Not connected to server. Reconnecting...', 'error');
        connectWebSocket();
    }
}

// Append message to chat
function appendMessage(data) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    
    // Check if sender is current user
    const isSelf = currentUser && data.sender.id === currentUser.id;
    
    if (isSelf) {
        messageElement.classList.add('self');
    }
    
    // Check if sender is AI
    if (data.sender.isAI) {
        messageElement.classList.add('ai-message');
    }
    
    // Format timestamp
    const timestamp = new Date(data.timestamp);
    const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Create avatar and message content
    messageElement.innerHTML = `
        <div class="message-avatar">
            <img src="${data.sender.avatar || '/img/default-avatar.png'}" alt="${data.sender.username}">
        </div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-sender">${data.sender.username}</span>
                <span class="message-time">${timeString}</span>
            </div>
            <div class="message-text">${formatMessageText(data.message)}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Play notification sound for new messages (except self)
    if (!isSelf && document.visibilityState !== 'visible') {
        playNotificationSound();
        
        // Show browser notification
        showBrowserNotification(`${data.sender.username} in ${currentRoom ? currentRoom.name : 'chat'}`, data.message);
    }
}

// Format message text with basic markdown
function formatMessageText(text) {
    // Escape HTML
    const escaped = text.replace(/&/g, '&amp;')
                       .replace(/</g, '&lt;')
                       .replace(/>/g, '&gt;');
    
    // Basic markdown formatting
    return escaped
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Code
        .replace(/`(.*?)`/g, '<code>$1</code>')
        // Strikethrough
        .replace(/~~(.*?)~~/g, '<del>$1</del>')
        // Line breaks
        .replace(/\n/g, '<br>');
}

// Append system message
function appendSystemMessage(message, sender = 'System') {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'message system-message';
    
    // Format timestamp
    const timestamp = new Date();
    const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Create system message content
    messageElement.innerHTML = `
        <div class="system-message-content">
            <div class="message-header">
                <span class="message-sender">${sender}</span>
                <span class="message-time">${timeString}</span>
            </div>
            <div class="message-text">${formatMessageText(message)}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Append poll to chat
function appendPoll(poll) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    const pollElement = document.createElement('div');
    pollElement.className = 'message poll-message';
    pollElement.dataset.pollId = poll.id;
    
    // Create poll options HTML
    const optionsHtml = poll.options.map((option, index) => `
        <div class="poll-option" data-option-index="${index}">
            <button class="poll-vote-btn">${option}</button>
            <div class="poll-progress">
                <div class="poll-progress-bar" style="width: 0%"></div>
                <div class="poll-vote-count">0 votes (0%)</div>
            </div>
        </div>
    `).join('');
    
    // Create poll content
    pollElement.innerHTML = `
        <div class="poll-content">
            <div class="poll-header">
                <span class="poll-title">📊 Poll: ${poll.question}</span>
                <span class="poll-creator">Created by ${poll.createdBy}</span>
            </div>
            <div class="poll-options">
                ${optionsHtml}
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(pollElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Add event listeners to vote buttons
    pollElement.querySelectorAll('.poll-vote-btn').forEach(button => {
        button.addEventListener('click', function() {
            const optionIndex = parseInt(this.parentNode.dataset.optionIndex);
            votePoll(poll.id, optionIndex);
            
            // Disable all vote buttons in this poll
            pollElement.querySelectorAll('.poll-vote-btn').forEach(btn => {
                btn.disabled = true;
                btn.classList.add('voted');
            });
            
            // Highlight the selected option
            this.classList.add('selected');
        });
    });
}

// Vote in a poll
function votePoll(pollId, optionIndex) {
    if (!currentRoom) return;
    
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({
            type: 'vote_poll',
            roomId: currentRoom.id,
            pollId: pollId,
            optionIndex: optionIndex
        }));
    } else {
        showNotification('Not connected to server. Vote not sent.', 'error');
    }
}

// Update poll votes display
function updatePollVotes(pollId, votes) {
    const pollElement = document.querySelector(`.poll-message[data-poll-id="${pollId}"]`);
    if (!pollElement) return;
    
    const totalVotes = votes.reduce((sum, count) => sum + count, 0);
    
    // Update each option's progress bar and vote count
    votes.forEach((voteCount, index) => {
        const optionElement = pollElement.querySelector(`.poll-option[data-option-index="${index}"]`);
        if (!optionElement) return;
        
        const progressBar = optionElement.querySelector('.poll-progress-bar');
        const voteCountEl = optionElement.querySelector('.poll-vote-count');
        
        const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
        
        progressBar.style.width = `${percentage}%`;
        voteCountEl.textContent = `${voteCount} vote${voteCount !== 1 ? 's' : ''} (${percentage}%)`;
    });
}

// Handle page visibility change
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        // User is looking at the page again, update status to online
        updateUserStatus('online');
    } else {
        // User switched away, update status to away
        updateUserStatus('away');
    }
}

// Update user online status
function updateUserStatus(status) {
    if (!webSocket || webSocket.readyState !== WebSocket.OPEN) return;
    
    webSocket.send(JSON.stringify({
        type: 'status_update',
        status: status
    }));
}

// Show notification
function showNotification(message, type = 'info') {
    // Use live indicator for notifications
    const liveIndicator = document.getElementById('liveIndicator');
    if (!liveIndicator) return;
    
    // Set icon based on notification type
    let icon = '';
    switch (type) {
        case 'success': icon = '✅'; break;
        case 'error': icon = '❌'; break;
        case 'warning': icon = '⚠️'; break;
        case 'info': icon = 'ℹ️'; break;
        default: icon = '🔔';
    }
    
    liveIndicator.innerHTML = `<span class="pulse"></span> ${icon} ${message}`;
    liveIndicator.className = 'live-indicator';
    
    // Clear any existing timeout
    if (window.liveIndicatorTimeout) {
        clearTimeout(window.liveIndicatorTimeout);
    }
    
    // Set timeout to hide after 5 seconds
    window.liveIndicatorTimeout = setTimeout(() => {
        liveIndicator.classList.add('fade');
    }, 5000);
}

// Play notification sound
function playNotificationSound() {
    const audio = new Audio('/audio/notification.mp3');
    audio.play().catch(err => console.error('Error playing notification sound:', err));
}

// Show browser notification
function showBrowserNotification(title, body) {
    // Check if browser notifications are supported
    if (!("Notification" in window)) return;
    
    // Check if permission granted
    if (Notification.permission === "granted") {
        new Notification(title, { body: body });
    } 
    // Request permission if not asked yet
    else if (Notification.permission !== "denied") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                new Notification(title, { body: body });
            }
        });
    }
}

// Get authentication token
function getToken() {
    return localStorage.getItem('token');
}

// Join a room
function joinRoom(roomId, password = null) {
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({
            type: 'join_room',
            roomId: roomId,
            password: password
        }));
    } else {
        showNotification('Not connected to server. Cannot join room.', 'error');
        connectWebSocket();
    }
}

// Leave current room
function leaveCurrentRoom() {
    if (!currentRoom) {
        showNotification('No room selected', 'error');
        return;
    }
    
    if (!confirm(`Are you sure you want to leave ${currentRoom.name}?`)) {
        return;
    }
    
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(JSON.stringify({
            type: 'leave_room',
            roomId: currentRoom.id
        }));
        
        // Clear current room data
        currentRoom = null;
        
        // Clear chat messages
        const messagesContainer = document.getElementById('messagesContainer');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        
        // Clear members list
        const membersList = document.getElementById('membersList');
        if (membersList) {
            membersList.innerHTML = '';
        }
        
        // Update UI
        const roomTitle = document.getElementById('roomTitle');
        if (roomTitle) {
            roomTitle.textContent = 'No Room Selected';
        }
        
        const roomDescription = document.getElementById('roomDescription');
        if (roomDescription) {
            roomDescription.textContent = 'Please join or create a room';
        }
        
        showNotification('Left room successfully', 'info');
    } else {
        showNotification('Not connected to server. Cannot leave room.', 'error');
    }
}