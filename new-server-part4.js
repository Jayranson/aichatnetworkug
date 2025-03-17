// Handle leaving a room
function handleLeaveRoom(message, user) {
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
    
    // Check if user is in the room
    if (!room.members.includes(user.id)) {
        sendError(user, 'You are not a member of this room');
        return;
    }
    
    // Remove user from room members
    room.members = room.members.filter(id => id !== user.id);
    
    // Handle ownership transfer if owner leaves
    if (room.owner === user.id) {
        // Find a new owner from hosts
        const newOwner = room.hosts.find(id => id !== user.id && room.members.includes(id));
        
        if (newOwner) {
            // Transfer ownership to another host
            room.owner = newOwner;
            
            // Broadcast owner change
            broadcastToRoom(room.id, {
                type: 'owner_changed',
                roomId: room.id,
                newOwnerId: newOwner,
                newOwnerName: connectedUsers.find(u => u.id === newOwner)?.username || 'Unknown'
            });
        } else if (room.members.length > 0) {
            // If no hosts left, make the first member an owner and host
            room.owner = room.members[0];
            room.hosts.push(room.members[0]);
            
            // Broadcast owner change
            broadcastToRoom(room.id, {
                type: 'owner_changed',
                roomId: room.id,
                newOwnerId: room.members[0],
                newOwnerName: connectedUsers.find(u => u.id === room.members[0])?.username || 'Unknown'
            });
        }
    }
    
    // Remove user from hosts if they were a host
    if (room.hosts.includes(user.id)) {
        room.hosts = room.hosts.filter(id => id !== user.id);
    }
    
    // Delete room if empty
    if (room.members.length === 0) {
        const roomIndex = rooms.findIndex(r => r.id === room.id);
        if (roomIndex !== -1) {
            rooms.splice(roomIndex, 1);
            
            // Broadcast room removal
            broadcastToAll({
                type: 'room_removed',
                roomId: room.id
            });
        }
    } else {
        // Broadcast user leaving
        broadcastToRoom(room.id, {
            type: 'user_left',
            userId: user.id,
            username: user.username
        });
    }
    
    // Save data
    saveData();
    
    // Confirm to user
    user.socket.send(JSON.stringify({
        type: 'leave_room_result',
        roomId: room.id,
        success: true
    }));
}

// Handle updating room settings
function handleUpdateRoomSettings(message, user) {
    if (!message.roomId || !message.settings) {
        sendError(user, 'Invalid request format');
        return;
    }
    
    // Find room
    const room = rooms.find(r => r.id === message.roomId);
    if (!room) {
        sendError(user, 'Room not found');
        return;
    }
    
    // Check if user has permission (owner or host)
    if (room.owner !== user.id && !room.hosts.includes(user.id)) {
        sendError(user, 'You do not have permission to update room settings');
        return;
    }
    
    // Update settings
    const { name, description, isPrivate, password, allowGuests, aiEnabled, slowMode, slowModeDelay } = message.settings;
    
    if (name) room.name = name;
    if (description !== undefined) room.description = description;
    if (isPrivate !== undefined) room.isPrivate = isPrivate;
    if (isPrivate && password) room.password = password;
    
    // Update room settings
    if (!room.settings) room.settings = {};
    
    if (allowGuests !== undefined) room.settings.allowGuests = allowGuests;
    if (aiEnabled !== undefined) room.settings.aiEnabled = aiEnabled;
    if (slowMode !== undefined) room.settings.slowMode = slowMode;
    if (slowModeDelay !== undefined) room.settings.slowModeDelay = slowModeDelay;
    
    // Save data
    saveData();
    
    // Notify user
    user.socket.send(JSON.stringify({
        type: 'room_settings_update_result',
        success: true,
        message: 'Room settings updated successfully'
    }));
    
    // Broadcast room update
    broadcastToRoom(room.id, {
        type: 'room_updated',
        roomId: room.id,
        name: room.name,
        description: room.description,
        settings: room.settings
    });
}

// Handle getting room members
function handleGetRoomMembers(message, user) {
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
    
    // Check if user is in the room
    if (!room.members.includes(user.id)) {
        sendError(user, 'You are not a member of this room');
        return;
    }
    
    // Get all member details
    const members = room.members.map(memberId => {
        const member = connectedUsers.find(u => u.id === memberId);
        const memberData = member || { id: memberId, status: 'offline' };
        const userData = users.find(u => u.id === memberId);
        
        return {
            id: memberId,
            username: userData?.username || memberData.username || 'Unknown',
            avatar: getUserAvatar(memberId),
            status: memberData.status || 'offline',
            isOwner: room.owner === memberId,
            isHost: room.hosts.includes(memberId),
            roles: userData?.roles || []
        };
    });
    
    // Send members list
    user.socket.send(JSON.stringify({
        type: 'room_members',
        roomId: room.id,
        members: members
    }));
}

// Handle status update
function handleStatusUpdate(message, user) {
    if (!message.status) {
        return;
    }
    
    // Valid statuses
    const validStatuses = ['online', 'away', 'busy', 'invisible'];
    if (!validStatuses.includes(message.status)) {
        return;
    }
    
    // Update status
    user.status = message.status;
    
    // Broadcast to rooms where user is a member
    rooms.forEach(room => {
        if (room.members.includes(user.id)) {
            broadcastToRoom(room.id, {
                type: 'user_status_update',
                userId: user.id,
                status: user.status
            });
        }
    });
}

// Handle typing indicator
function handleTypingIndicator(message, user) {
    if (!message.roomId || message.isTyping === undefined) {
        return;
    }
    
    // Find room
    const room = rooms.find(r => r.id === message.roomId);
    if (!room || !room.members.includes(user.id)) {
        return;
    }
    
    // Broadcast typing status to room
    broadcastToRoom(room.id, {
        type: 'user_typing',
        userId: user.id,
        username: user.username,
        isTyping: message.isTyping
    }, [user.id]); // Don't send back to the user who is typing
}

// Handle poll vote
function handlePollVote(message, user) {
    if (!message.roomId || !message.pollId || message.optionIndex === undefined) {
        sendError(user, 'Invalid vote format');
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
    
    // Find poll
    if (!room.polls || !room.polls[message.pollId]) {
        sendError(user, 'Poll not found');
        return;
    }
    
    const poll = room.polls[message.pollId];
    
    // Check if user already voted
    if (poll.voters.includes(user.id)) {
        sendError(user, 'You have already voted in this poll');
        return;
    }
    
    // Check if option index is valid
    if (message.optionIndex < 0 || message.optionIndex >= poll.options.length) {
        sendError(user, 'Invalid option selected');
        return;
    }
    
    // Record vote
    poll.votes[message.optionIndex]++;
    poll.voters.push(user.id);
    
    // Save data
    saveData();
    
    // Broadcast updated poll results
    broadcastToRoom(room.id, {
        type: 'poll_updated',
        pollId: message.pollId,
        votes: poll.votes
    });
    
    // Confirm vote to user
    user.socket.send(JSON.stringify({
        type: 'vote_recorded',
        pollId: message.pollId,
        optionIndex: message.optionIndex
    }));
}

// AI Chat Commands
const aiCommands = {
    // Help command
    help: {
        description: 'Shows a list of available commands',
        adminOnly: false,
        handler: (user, room, args) => {
            const userRoles = getUserRoles(user.id);
            const isRoomOwnerOrHost = room && (room.owner === user.id || room.hosts.includes(user.id));
            
            const commands = Object.entries(aiCommands)
                .filter(([_, cmd]) => !cmd.adminOnly || 
                    (userRoles.includes('admin') || userRoles.includes('owner') || isRoomOwnerOrHost))
                .map(([name, cmd]) => `/${name} - ${cmd.description}`);
            
            return {
                message: `Available commands:\n${commands.join('\n')}`,
                sender: 'AI Assistant'
            };
        }
    },
    
    // Toggle AI in the room
    ai: {
        description: 'Toggles the AI assistant in the current room (admin/host/owner only)',
        adminOnly: true,
        handler: (user, room, args) => {
            if (!room) return { message: 'You must be in a room to use this command', sender: 'System' };
            
            // Check if user has permission
            const userRoles = getUserRoles(user.id);
            const isRoomOwnerOrHost = room.owner === user.id || room.hosts.includes(user.id);
            
            if (!userRoles.includes('admin') && !userRoles.includes('owner') && !isRoomOwnerOrHost) {
                return { message: 'You do not have permission to use this command', sender: 'System' };
            }
            
            // Toggle AI setting
            room.settings.aiEnabled = !room.settings.aiEnabled;
            
            // Save data
            saveData();
            
            return {
                message: `AI assistant is now ${room.settings.aiEnabled ? 'enabled' : 'disabled'} in this room`,
                sender: 'System'
            };
        }
    },
    
    // Make AI say something
    say: {
        description: 'Makes the AI say something (admin/host/owner only)',
        adminOnly: true,
        handler: (user, room, args) => {
            if (!room) return { message: 'You must be in a room to use this command', sender: 'System' };
            if (!args || args.length === 0) {
                return { message: 'Usage: /say [message]', sender: 'System' };
            }
            
            // Check if user has permission
            const userRoles = getUserRoles(user.id);
            const isRoomOwnerOrHost = room.owner === user.id || room.hosts.includes(user.id);
            
            if (!userRoles.includes('admin') && !userRoles.includes('owner') && !isRoomOwnerOrHost) {
                return { message: 'You do not have permission to use this command', sender: 'System' };
            }
            
            // Return message to be sent by AI
            return {
                message: args.join(' '),
                sender: 'AI Assistant',
                silent: true // Don't show "System" confirmation message
            };
        }
    },
    
    // Kick a user
    kick: {
        description: 'Kicks a user from the room (host/owner only)',
        adminOnly: true,
        handler: (user, room, args) => {
            if (!room) return { message: 'You must be in a room to use this command', sender: 'System' };
            if (!args || args.length === 0) {
                return { message: 'Usage: /kick [username] [reason]', sender: 'System' };
            }
            
            // Check if user has permission
            const userRoles = getUserRoles(user.id);
            const isRoomOwnerOrHost = room.owner === user.id || room.hosts.includes(user.id);
            
            if (!userRoles.includes('admin') && !userRoles.includes('owner') && !isRoomOwnerOrHost) {
                return { message: 'You do not have permission to use this command', sender: 'System' };
            }
            
            const username = args[0];
            const reason = args.slice(1).join(' ') || 'No reason provided';
            
            // Find target user
            const targetUser = connectedUsers.find(u => u.username.toLowerCase() === username.toLowerCase());
            if (!targetUser) {
                return { message: `User ${username} not found or offline`, sender: 'System' };
            }
            
            // Find target user using all users if not connected
            const targetUserData = users.find(u => u.username.toLowerCase() === username.toLowerCase());
            if (!targetUserData) {
                return { message: `User ${username} not found`, sender: 'System' };
            }
            
            // Check if target is in the room
            if (!room.members.includes(targetUserData.id)) {
                return { message: `User ${username} is not in this room`, sender: 'System' };
            }
            
            // Check if target is the room owner
            if (targetUserData.id === room.owner) {
                return { message: 'You cannot kick the room owner', sender: 'System' };
            }
            
            // Check if target is an admin and kicker is not
            if (targetUserData.roles.includes('admin') && !userRoles.includes('admin')) {
                return { message: 'You cannot kick an admin', sender: 'System' };
            }
            
            // Remove user from room
            room.members = room.members.filter(id => id !== targetUserData.id);
            
            // If user was a host, remove from hosts
            if (room.hosts.includes(targetUserData.id)) {
                room.hosts = room.hosts.filter(id => id !== targetUserData.id);
            }
            
            // Save data
            saveData();
            
            // Notify target if online
            if (targetUser && targetUser.socket) {
                targetUser.socket.send(JSON.stringify({
                    type: 'kicked',
                    roomId: room.id,
                    roomName: room.name,
                    reason: reason
                }));
            }
            
            // Broadcast kick to room
            broadcastToRoom(room.id, {
                type: 'user_kicked',
                username: targetUserData.username,
                reason: reason,
                by: user.username
            });
            
            return {
                message: `${targetUserData.username} has been kicked from the room. Reason: ${reason}`,
                sender: 'AI Assistant'
            };
        }
    }
}