// WebSocket handling
server.on('upgrade', (request, socket, head) => {
    // Parse URL for token
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    
    if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
    }
    
    // Verify token
    jwt.verify(token, config.jwtSecret, (err, decoded) => {
        if (err) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
        }
        
        // Check if user is banned
        const user = users.find(u => u.id === decoded.id);
        if (user && user.banned) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
        }
        
        // Store user information for WebSocket handlers
        request.user = decoded;
        
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });
});

// WebSocket connection handler
wss.on('connection', (socket, request) => {
    const user = request.user;
    console.log(`User connected: ${user.username}`);
    
    // Add to connected users
    const connectedUser = {
        id: user.id,
        username: user.username,
        socket: socket,
        status: 'online',
        roles: user.roles || []
    };
    
    // Check if already connected (handles reconnect)
    const existingUser = connectedUsers.find(u => u.id === user.id);
    if (existingUser) {
        // Replace socket and update status
        existingUser.socket = socket;
        existingUser.status = 'online';
    } else {
        // Add new user
        connectedUsers.push(connectedUser);
    }
    
    // Send confirmation to the user
    socket.send(JSON.stringify({
        type: 'connected',
        user: {
            id: user.id,
            username: user.username
        }
    }));
    
    // Handle incoming messages
    socket.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(message, connectedUser);
        } catch (e) {
            console.error('Error parsing message:', e);
        }
    });
    
    // Handle disconnection
    socket.on('close', () => {
        console.log(`User disconnected: ${user.username}`);
        
        // Remove user from connected users
        const userIndex = connectedUsers.findIndex(u => u.id === user.id);
        if (userIndex !== -1) {
            connectedUsers.splice(userIndex, 1);
        }
        
        // Notify all rooms where user was a member
        rooms.forEach(room => {
            if (room.members.includes(user.id)) {
                broadcastToRoom(room.id, {
                    type: 'user_left',
                    userId: user.id
                });
            }
        });
    });
});

// Message handler
function handleMessage(message, user) {
    console.log(`Received message of type: ${message.type} from ${user.username}`);
    
    switch (message.type) {
        case 'message':
            // Regular chat message
            handleChatMessage(message, user);
            break;
            
        case 'whisper':
            // Private whisper message
            handleWhisperMessage(message, user);
            break;
            
        case 'create_room':
            // Create new room
            handleCreateRoom(message, user);
            break;
            
        case 'join_room':
            // Join existing room
            handleJoinRoom(message, user);
            break;
            
        case 'leave_room':
            // Leave room
            handleLeaveRoom(message, user);
            break;
            
        case 'update_room_settings':
            // Update room settings
            handleUpdateRoomSettings(message, user);
            break;
            
        case 'get_room_members':
            // Get members of a room
            handleGetRoomMembers(message, user);
            break;
            
        case 'status_update':
            // Update user status
            handleStatusUpdate(message, user);
            break;
            
        case 'typing':
            // User is typing
            handleTypingIndicator(message, user);
            break;
            
        case 'vote_poll':
            // Vote in a poll
            handlePollVote(message, user);
            break;
    }
}

// Handle regular chat message
function handleChatMessage(message, user) {
    if (!message.roomId || !message.content) {
        sendError(user, 'Invalid message format');
        return;
    }
    
    // Find room
    const room = rooms.find(r => r.id === message.roomId);
    if (!room) {
        sendError(user, 'Room not found');
        return;
    }
    
    // Check if user is in the room
    if (!room.members.includes(user.id)) {
        sendError(user, 'You are not a member of this room');
        return;
    }
    
    // Check if user is muted
    if (room.mutedUsers && room.mutedUsers[user.id] && room.mutedUsers[user.id] > Date.now()) {
        const muteTimeRemaining = Math.ceil((room.mutedUsers[user.id] - Date.now()) / 60000);
        sendError(user, `You are muted for ${muteTimeRemaining} more minute(s)`);
        return;
    }
    
    // Check for slow mode
    if (room.settings && room.settings.slowMode) {
        const now = Date.now();
        const lastMessageTime = user.lastMessageTime && user.lastMessageTime[room.id];
        const cooldown = (room.settings.slowModeDelay || 5) * 1000;
        
        if (lastMessageTime && (now - lastMessageTime) < cooldown) {
            const waitTime = Math.ceil((cooldown - (now - lastMessageTime)) / 1000);
            sendError(user, `Slow mode is enabled. Please wait ${waitTime} seconds before sending another message.`);
            return;
        }
        
        // Update last message time
        if (!user.lastMessageTime) user.lastMessageTime = {};
        user.lastMessageTime[room.id] = now;
    }
    
    // Check if message is a command
    if (message.content.startsWith('/')) {
        const commandResult = processCommand(message.content, user, message.roomId);
        
        if (commandResult) {
            // Send command response back to user
            user.socket.send(JSON.stringify({
                type: 'command_response',
                message: commandResult.message,
                sender: commandResult.sender
            }));
            
            // If silent flag is not set, also broadcast command message
            if (!commandResult.silent) {
                broadcastToRoom(message.roomId, {
                    type: 'message',
                    sender: {
                        id: 'ai-assistant',
                        username: commandResult.sender,
                        isAI: true
                    },
                    message: commandResult.message,
                    timestamp: Date.now()
                });
            }
        }
        return;
    }
    
    // Process and broadcast message to room
    broadcastToRoom(message.roomId, {
        type: 'message',
        sender: {
            id: user.id,
            username: user.username,
            avatar: getUserAvatar(user.id)
        },
        message: message.content,
        timestamp: Date.now()
    });
    
    // Have AI respond occasionally (if enabled)
    if (room.settings && room.settings.aiEnabled && Math.random() < 0.1) { // 10% chance
        setTimeout(() => {
            const aiResponses = [
                "That's an interesting point!",
                "I see what you mean.",
                "Thanks for sharing that.",
                "I'm following the conversation with interest.",
                "That's worth thinking about further.",
                "Great discussion everyone!"
            ];
            
            const response = aiResponses[Math.floor(Math.random() * aiResponses.length)];
            
            broadcastToRoom(message.roomId, {
                type: 'message',
                sender: {
                    id: 'ai-assistant',
                    username: 'AI Assistant',
                    isAI: true
                },
                message: response,
                timestamp: Date.now()
            });
        }, 2000 + Math.random() * 3000); // 2-5 second delay
    }
}

// Handle whisper message
function handleWhisperMessage(message, user) {
    if (!message.targetId || !message.content) {
        sendError(user, 'Invalid whisper format');
        return;
    }
    
    // Find target user
    const targetUser = connectedUsers.find(u => u.id === message.targetId);
    if (!targetUser) {
        sendError(user, 'User is not online');
        return;
    }
    
    // Check if target has blocked the sender
    const targetUserData = users.find(u => u.id === targetUser.id);
    if (targetUserData && targetUserData.blockedUsers && targetUserData.blockedUsers.includes(user.id)) {
        sendError(user, 'Cannot send message to this user');
        return;
    }
    
    // Send whisper to target
    targetUser.socket.send(JSON.stringify({
        type: 'whisper',
        from: {
            id: user.id,
            username: user.username,
            avatar: getUserAvatar(user.id)
        },
        message: message.content
    }));
    
    // Confirm to sender
    user.socket.send(JSON.stringify({
        type: 'whisper_sent',
        to: {
            id: targetUser.id,
            username: targetUser.username
        },
        message: message.content
    }));
}

// Handle room creation
function handleCreateRoom(message, user) {
    if (!message.roomData) {
        sendError(user, 'Invalid room data');
        return;
    }
    
    const roomData = message.roomData;
    
    // Validate room name
    if (!roomData.name || roomData.name.trim().length === 0) {
        sendError(user, 'Room name is required');
        return;
    }
    
    // Create new room
    const roomId = `room-${generateId()}`;
    const newRoom = {
        id: roomId,
        name: roomData.name,
        description: roomData.description || '',
        capacity: roomData.capacity || 50,
        isPrivate: roomData.isPrivate || false,
        password: roomData.password || null,
        owner: user.id,
        hosts: [user.id],
        members: [user.id],
        created: Date.now(),
        settings: {
            allowGuests: roomData.allowGuests !== undefined ? roomData.allowGuests : true,
            moderated: roomData.moderated || false,
            aiEnabled: roomData.aiEnabled !== undefined ? roomData.aiEnabled : true,
            slowMode: roomData.slowMode || false,
            slowModeDelay: roomData.slowModeDelay || 5
        }
    };
    
    // Add room to list
    rooms.push(newRoom);
    
    // Save data
    saveData();
    
    // Notify creator
    user.socket.send(JSON.stringify({
        type: 'room_created',
        room: {
            id: newRoom.id,
            name: newRoom.name,
            description: newRoom.description,
            memberCount: 1,
            isPrivate: newRoom.isPrivate
        }
    }));
    
    // Broadcast room creation to all users
    broadcastToAll({
        type: 'room_added',
        room: {
            id: newRoom.id,
            name: newRoom.name,
            description: newRoom.description,
            memberCount: 1,
            isPrivate: newRoom.isPrivate,
            owner: user.username
        }
    });
    
    // Send room details to creator
    user.socket.send(JSON.stringify({
        type: 'room_joined',
        room: {
            id: newRoom.id,
            name: newRoom.name,
            description: newRoom.description,
            members: [{
                id: user.id,
                username: user.username,
                avatar: getUserAvatar(user.id),
                isOwner: true,
                isHost: true
            }],
            settings: newRoom.settings
        }
    }));
}

// Handle joining a room
function handleJoinRoom(message, user) {
    if (!message.roomId) {
        sendError(user, 'Room ID is required');
        return;
    }
    
    // Find room
    const room = rooms.find(r => r.id === message.roomId);
    if (!room) {
        sendError(user, 'Room not found');
        return;
    }
    
    // Check if room is full
    if (room.members.length >= room.capacity) {
        sendError(user, 'Room is full');
        return;
    }
    
    // Check if user is banned from the room
    if (room.bannedUsers && room.bannedUsers.includes(user.id)) {
        sendError(user, 'You are banned from this room');
        return;
    }
    
    // Check password for private rooms
    if (room.isPrivate && room.password && room.password !== message.password) {
        sendError(user, 'Incorrect password');
        return;
    }
    
    // Add user to room members if not already a member
    if (!room.members.includes(user.id)) {
        room.members.push(user.id);
        
        // Save data
        saveData();
    }
    
    // Send room data to user
    user.socket.send(JSON.stringify({
        type: 'room_joined',
        room: {
            id: room.id,
            name: room.name,
            description: room.description,
            isPrivate: room.isPrivate,
            settings: room.settings,
            members: room.members.map(memberId => {
                const member = connectedUsers.find(u => u.id === memberId);
                if (!member) return null;
                
                return {
                    id: member.id,
                    username: member.username,
                    avatar: getUserAvatar(member.id),
                    status: member.status || 'online',
                    isOwner: room.owner === member.id,
                    isHost: room.hosts.includes(member.id),
                    roles: member.roles
                };
            }).filter(m => m !== null)
        }
    }));
    
    // Broadcast to room that user joined
    broadcastToRoom(room.id, {
        type: 'user_joined',
        user: {
            id: user.id,
            username: user.username,
            avatar: getUserAvatar(user.id),
            isOwner: room.owner === user.id,
            isHost: room.hosts.includes(user.id)
        }
    }, [user.id]); // Don't send to the joining user
}