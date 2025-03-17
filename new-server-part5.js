// More AI commands
const moreAiCommands = {
    // Ban a user
    ban: {
        description: 'Bans a user from the room (host/owner only)',
        adminOnly: true,
        handler: (user, room, args) => {
            if (!room) return { message: 'You must be in a room to use this command', sender: 'System' };
            if (!args || args.length === 0) {
                return { message: 'Usage: /ban [username] [reason]', sender: 'System' };
            }
            
            // Check if user has permission
            const userRoles = getUserRoles(user.id);
            const isRoomOwnerOrHost = room.owner === user.id || room.hosts.includes(user.id);
            
            if (!userRoles.includes('admin') && !userRoles.includes('owner') && !isRoomOwnerOrHost) {
                return { message: 'You do not have permission to use this command', sender: 'System' };
            }
            
            const username = args[0];
            const reason = args.slice(1).join(' ') || 'No reason provided';
            
            // Find target user data
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
                return { message: 'You cannot ban the room owner', sender: 'System' };
            }
            
            // Check if target is an admin and banner is not
            if (targetUserData.roles.includes('admin') && !userRoles.includes('admin')) {
                return { message: 'You cannot ban an admin', sender: 'System' };
            }
            
            // Add user to banned list
            if (!room.bannedUsers) {
                room.bannedUsers = [];
            }
            
            if (!room.bannedUsers.includes(targetUserData.id)) {
                room.bannedUsers.push(targetUserData.id);
            }
            
            // Remove user from room
            room.members = room.members.filter(id => id !== targetUserData.id);
            
            // If user was a host, remove from hosts
            if (room.hosts.includes(targetUserData.id)) {
                room.hosts = room.hosts.filter(id => id !== targetUserData.id);
            }
            
            // Save data
            saveData();
            
            // Find target user's socket if online
            const targetUser = connectedUsers.find(u => u.id === targetUserData.id);
            
            // Notify target if online
            if (targetUser && targetUser.socket) {
                targetUser.socket.send(JSON.stringify({
                    type: 'banned',
                    roomId: room.id,
                    roomName: room.name,
                    reason: reason
                }));
            }
            
            // Broadcast ban to room
            broadcastToRoom(room.id, {
                type: 'user_banned',
                username: targetUserData.username,
                reason: reason,
                by: user.username
            });
            
            return {
                message: `${targetUserData.username} has been banned from the room. Reason: ${reason}`,
                sender: 'AI Assistant'
            };
        }
    },
    
    // Mute a user
    mute: {
        description: 'Mutes a user in the room for a specified duration (host/owner only)',
        adminOnly: true,
        handler: (user, room, args) => {
            if (!room) return { message: 'You must be in a room to use this command', sender: 'System' };
            if (!args || args.length < 2) {
                return { message: 'Usage: /mute [username] [duration in minutes] [reason]', sender: 'System' };
            }
            
            // Check if user has permission
            const userRoles = getUserRoles(user.id);
            const isRoomOwnerOrHost = room.owner === user.id || room.hosts.includes(user.id);
            
            if (!userRoles.includes('admin') && !userRoles.includes('owner') && !isRoomOwnerOrHost) {
                return { message: 'You do not have permission to use this command', sender: 'System' };
            }
            
            const username = args[0];
            const duration = parseInt(args[1]);
            const reason = args.slice(2).join(' ') || 'No reason provided';
            
            if (isNaN(duration) || duration <= 0) {
                return { message: 'Duration must be a positive number of minutes', sender: 'System' };
            }
            
            // Find target user data
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
                return { message: 'You cannot mute the room owner', sender: 'System' };
            }
            
            // Check if target is an admin and muter is not
            if (targetUserData.roles.includes('admin') && !userRoles.includes('admin')) {
                return { message: 'You cannot mute an admin', sender: 'System' };
            }
            
            // Add user to muted users
            if (!room.mutedUsers) {
                room.mutedUsers = {};
            }
            
            // Set mute end time
            const muteEndTime = Date.now() + (duration * 60 * 1000);
            room.mutedUsers[targetUserData.id] = muteEndTime;
            
            // Save data
            saveData();
            
            // Find target user's socket if online
            const targetUser = connectedUsers.find(u => u.id === targetUserData.id);
            
            // Notify target if online
            if (targetUser && targetUser.socket) {
                targetUser.socket.send(JSON.stringify({
                    type: 'muted',
                    roomId: room.id,
                    roomName: room.name,
                    duration: duration,
                    reason: reason,
                    endTime: muteEndTime
                }));
            }
            
            // Broadcast mute to room
            broadcastToRoom(room.id, {
                type: 'user_muted',
                username: targetUserData.username,
                duration: duration,
                reason: reason,
                by: user.username
            });
            
            // Set timeout to unmute
            setTimeout(() => {
                if (room.mutedUsers && room.mutedUsers[targetUserData.id]) {
                    delete room.mutedUsers[targetUserData.id];
                    
                    // Save data
                    saveData();
                    
                    // Find target user's socket if still online
                    const stillConnectedUser = connectedUsers.find(u => u.id === targetUserData.id);
                    
                    // Notify target if still online
                    if (stillConnectedUser && stillConnectedUser.socket) {
                        stillConnectedUser.socket.send(JSON.stringify({
                            type: 'unmuted',
                            roomId: room.id,
                            roomName: room.name
                        }));
                    }
                    
                    // Broadcast unmute to room
                    broadcastToRoom(room.id, {
                        type: 'user_unmuted',
                        username: targetUserData.username
                    });
                }
            }, duration * 60 * 1000);
            
            return {
                message: `${targetUserData.username} has been muted for ${duration} minutes. Reason: ${reason}`,
                sender: 'AI Assistant'
            };
        }
    },
    
    // Send message to all AIs in all rooms
    aiall: {
        description: 'Sends a message through all AI assistants in all rooms (admin only)',
        adminOnly: true,
        handler: (user, room, args) => {
            // Check if user is an admin
            const userRoles = getUserRoles(user.id);
            if (!userRoles.includes('admin') && !userRoles.includes('owner')) {
                return { message: 'You do not have permission to use this command', sender: 'System' };
            }
            
            if (!args || args.length === 0) {
                return { message: 'Usage: /aiall [message]', sender: 'System' };
            }
            
            const message = args.join(' ');
            
            // Broadcast to all rooms
            rooms.forEach(r => {
                // Only broadcast to rooms where AI is enabled
                if (r.settings && r.settings.aiEnabled) {
                    broadcastToRoom(r.id, {
                        type: 'message',
                        sender: {
                            id: 'ai-assistant',
                            username: 'AI Assistant',
                            isAI: true
                        },
                        message: message,
                        timestamp: Date.now()
                    });
                }
            });
            
            return { 
                message: 'Message broadcast through all AI assistants in all active rooms', 
                sender: 'System' 
            };
        }
    },
    
    // Entertainment commands
    joke: {
        description: 'Makes the AI tell a joke',
        adminOnly: false,
        handler: (user, room, args) => {
            if (!room) return { message: 'You must be in a room to use this command', sender: 'System' };
            
            // Array of family-friendly jokes
            const jokes = [
                "Why don't scientists trust atoms? Because they make up everything!",
                "I told my wife she was drawing her eyebrows too high. She looked surprised.",
                "Why did the scarecrow win an award? Because he was outstanding in his field!",
                "I'm reading a book about anti-gravity. It's impossible to put down!",
                "Did you hear about the mathematician who's afraid of negative numbers? He'll stop at nothing to avoid them.",
                "Why did the bicycle fall over? Because it was two-tired!",
                "What's the best thing about Switzerland? I don't know, but the flag is a big plus.",
                "How do you organize a space party? You planet!",
                "Why did the coffee file a police report? It got mugged.",
                "What do you call a fake noodle? An impasta!"
            ];
            
            // Select a random joke
            const joke = jokes[Math.floor(Math.random() * jokes.length)];
            
            return {
                message: joke,
                sender: 'AI Assistant'
            };
        }
    },
    
    // 8-ball prediction command
    "8ball": {
        description: "Ask the magic 8-ball a question",
        adminOnly: false,
        handler: (user, room, args) => {
            if (!room) return { message: 'You must be in a room to use this command', sender: 'System' };
            if (!args || args.length === 0) {
                return { message: 'Usage: /8ball [your question]', sender: 'System' };
            }
            
            const responses = [
                "It is certain.",
                "It is decidedly so.",
                "Without a doubt.",
                "Yes definitely.",
                "You may rely on it.",
                "As I see it, yes.",
                "Most likely.",
                "Outlook good.",
                "Yes.",
                "Signs point to yes.",
                "Reply hazy, try again.",
                "Ask again later.",
                "Better not tell you now.",
                "Cannot predict now.",
                "Concentrate and ask again.",
                "Don't count on it.",
                "My reply is no.",
                "My sources say no.",
                "Outlook not so good.",
                "Very doubtful."
            ];
            
            const question = args.join(' ');
            const response = responses[Math.floor(Math.random() * responses.length)];
            
            return {
                message: `**Q: ${question}**\n🎱 ${response}`,
                sender: 'AI Assistant'
            };
        }
    },
    
    // Create a poll
    poll: {
        description: "Create a poll in the room (host/owner only)",
        adminOnly: true,
        handler: (user, room, args) => {
            if (!room) return { message: 'You must be in a room to use this command', sender: 'System' };
            
            // Check if user has permission
            const userRoles = getUserRoles(user.id);
            const isRoomOwnerOrHost = room.owner === user.id || room.hosts.includes(user.id);
            
            if (!userRoles.includes('admin') && !userRoles.includes('owner') && !isRoomOwnerOrHost) {
                return { message: 'You do not have permission to use this command', sender: 'System' };
            }
            
            // Extract question and options from args
            const fullText = args.join(' ');
            const matches = fullText.match(/"([^"]+)"/g);
            
            if (!matches || matches.length < 3) {
                return { message: 'Usage: /poll "Question" "Option 1" "Option 2" ["Option 3" ...]', sender: 'System' };
            }
            
            const question = matches[0].replace(/"/g, '');
            const options = matches.slice(1).map(opt => opt.replace(/"/g, ''));
            
            // Create poll
            const pollId = generateId();
            
            // Initialize poll
            if (!room.polls) {
                room.polls = {};
            }
            
            room.polls[pollId] = {
                id: pollId,
                question: question,
                options: options,
                votes: options.map(() => 0),
                voters: [],
                createdBy: user.username,
                createdAt: Date.now()
            };
            
            // Save data
            saveData();
            
            // Broadcast poll to room
            broadcastToRoom(room.id, {
                type: 'poll_created',
                poll: {
                    id: pollId,
                    question: question,
                    options: options,
                    createdBy: user.username
                }
            });
            
            return {
                message: `Poll created: "${question}"`,
                sender: 'System'
            };
        }
    }
};

// Merge all AI commands
Object.assign(aiCommands, moreAiCommands);

// Process commands in messages
function processCommand(message, user, roomId) {
    if (!message.startsWith('/')) return null;
    
    const parts = message.substring(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    // Find room
    const room = rooms.find(r => r.id === roomId);
    
    // Get command handler
    const commandHandler = aiCommands[command];
    if (!commandHandler) {
        return {
            message: `Unknown command: /${command}. Type /help for available commands.`,
            sender: 'System'
        };
    }
    
    // Execute command
    return commandHandler.handler(user, room, args);
}

// Utility functions
function generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function getUserRoles(userId) {
    const user = users.find(u => u.id === userId);
    return user ? user.roles || [] : [];
}

function getUserAvatar(userId) {
    const user = users.find(u => u.id === userId);
    return user ? user.avatar : null;
}

function sendError(user, message) {
    user.socket.send(JSON.stringify({
        type: 'error',
        message: message
    }));
}

function broadcastToRoom(roomId, message, excludeUserIds = []) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    
    room.members.forEach(memberId => {
        // Skip excluded users
        if (excludeUserIds.includes(memberId)) return;
        
        const user = connectedUsers.find(u => u.id === memberId);
        if (user && user.socket) {
            user.socket.send(JSON.stringify(message));
        }
    });
}

function broadcastToAll(message, excludeUserIds = []) {
    connectedUsers.forEach(user => {
        // Skip excluded users
        if (excludeUserIds.includes(user.id)) return;
        
        if (user.socket) {
            user.socket.send(JSON.stringify(message));
        }
    });
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    saveData(); // Save data before exit
    process.exit(0);
});

// Export for testing
module.exports = {
    app,
    server,
    users,
    rooms,
    connectedUsers
};