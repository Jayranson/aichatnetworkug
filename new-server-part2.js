// User management
app.get('/api/users/:id', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.params.id);
    
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Public user profile
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            bio: user.bio,
            roles: user.roles
        }
    });
});

app.post('/api/users/block', authenticateToken, (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID required' });
    }
    
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const user = users.find(u => u.id === req.user.id);
    
    // Add to blocked users
    if (!user.blockedUsers) {
        user.blockedUsers = [];
    }
    
    if (!user.blockedUsers.includes(userId)) {
        user.blockedUsers.push(userId);
    }
    
    // Save data
    saveData();
    
    res.json({
        success: true,
        message: `User ${targetUser.username} has been blocked`
    });
});

app.post('/api/users/unblock', authenticateToken, (req, res) => {
    const { userId } = req.body;
    
    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID required' });
    }
    
    const user = users.find(u => u.id === req.user.id);
    
    // Remove from blocked users
    if (user.blockedUsers && user.blockedUsers.includes(userId)) {
        user.blockedUsers = user.blockedUsers.filter(id => id !== userId);
    }
    
    // Save data
    saveData();
    
    res.json({
        success: true,
        message: 'User has been unblocked'
    });
});

app.get('/api/users/me/activity', authenticateToken, (req, res) => {
    const userId = req.user.id;
    
    // Get rooms where user is a member
    const userRooms = rooms.filter(room => room.members.includes(userId));
    
    // Format activity data
    const activity = {
        recentRooms: userRooms.map(room => ({
            id: room.id,
            name: room.name,
            lastJoined: room.lastJoined || room.created
        })).sort((a, b) => b.lastJoined - a.lastJoined).slice(0, 5),
        stats: {
            roomCount: userRooms.length,
            // Add other stats as needed
        }
    };
    
    res.json({
        success: true,
        activity
    });
});

// Admin endpoints
app.post('/api/admin/users/:id/ban', authenticateToken, (req, res) => {
    // Check if user is admin
    if (!req.user.roles || !req.user.roles.includes('admin')) {
        return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    
    const targetUser = users.find(u => u.id === req.params.id);
    
    if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Set banned flag
    targetUser.banned = true;
    
    // Save data
    saveData();
    
    // Disconnect user if online
    const connectedUser = connectedUsers.find(u => u.id === targetUser.id);
    if (connectedUser && connectedUser.socket) {
        connectedUser.socket.close(1000, 'You have been banned');
    }
    
    res.json({
        success: true,
        message: `User ${targetUser.username} has been banned`
    });
});

app.post('/api/admin/users/:id/unban', authenticateToken, (req, res) => {
    // Check if user is admin
    if (!req.user.roles || !req.user.roles.includes('admin')) {
        return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    
    const targetUser = users.find(u => u.id === req.params.id);
    
    if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Remove banned flag
    targetUser.banned = false;
    
    // Save data
    saveData();
    
    res.json({
        success: true,
        message: `User ${targetUser.username} has been unbanned`
    });
});

app.post('/api/admin/users/:id/roles', authenticateToken, (req, res) => {
    // Check if user is admin
    if (!req.user.roles || !req.user.roles.includes('admin')) {
        return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    
    const { role } = req.body;
    
    if (!role) {
        return res.status(400).json({ success: false, message: 'Role required' });
    }
    
    // Validate role
    const validRoles = ['user', 'host', 'admin', 'owner'];
    if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    
    const targetUser = users.find(u => u.id === req.params.id);
    
    if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Add role if not already present
    if (!targetUser.roles.includes(role)) {
        targetUser.roles.push(role);
    }
    
    // Save data
    saveData();
    
    res.json({
        success: true,
        message: `User ${targetUser.username} has been assigned the role of ${role}`,
        roles: targetUser.roles
    });
});

app.delete('/api/admin/users/:id/roles', authenticateToken, (req, res) => {
    // Check if user is admin
    if (!req.user.roles || !req.user.roles.includes('admin')) {
        return res.status(403).json({ success: false, message: 'Permission denied' });
    }
    
    const targetUser = users.find(u => u.id === req.params.id);
    
    if (!targetUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Reset roles to just 'user'
    targetUser.roles = ['user'];
    
    // Save data
    saveData();
    
    res.json({
        success: true,
        message: `User ${targetUser.username} roles have been reset`,
        roles: targetUser.roles
    });
});

// Room management endpoints
app.get('/api/rooms', (req, res) => {
    // Return public information about rooms
    const publicRooms = rooms.map(room => ({
        id: room.id,
        name: room.name,
        description: room.description,
        memberCount: room.members.length,
        isPrivate: room.isPrivate,
        owner: users.find(u => u.id === room.owner)?.username || 'Unknown'
    }));
    
    res.json({
        success: true,
        rooms: publicRooms
    });
});

app.get('/api/rooms/:id', authenticateToken, (req, res) => {
    const room = rooms.find(r => r.id === req.params.id);
    
    if (!room) {
        return res.status(404).json({ success: false, message: 'Room not found' });
    }
    
    // Check if room is private and user is not a member
    if (room.isPrivate && !room.members.includes(req.user.id)) {
        return res.status(403).json({ success: false, message: 'This room is private' });
    }
    
    // Return room data
    res.json({
        success: true,
        room: {
            id: room.id,
            name: room.name,
            description: room.description,
            isPrivate: room.isPrivate,
            owner: room.owner,
            hosts: room.hosts,
            members: room.members,
            settings: room.settings,
            created: room.created
        }
    });
});

// Stats endpoint
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        stats: {
            users: users.length,
            rooms: rooms.length,
            online: connectedUsers.length
        }
    });
});

// Helper functions for data persistence
function loadData() {
    try {
        // Load users data
        if (fs.existsSync(path.join(__dirname, '../data/users.json'))) {
            const userData = fs.readFileSync(path.join(__dirname, '../data/users.json'), 'utf8');
            users.push(...JSON.parse(userData));
        }
        
        // Load rooms data
        if (fs.existsSync(path.join(__dirname, '../data/rooms.json'))) {
            const roomData = fs.readFileSync(path.join(__dirname, '../data/rooms.json'), 'utf8');
            rooms.push(...JSON.parse(roomData));
        }
        
        console.log(`Loaded ${users.length} users and ${rooms.length} rooms from data files`);
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

function saveData() {
    try {
        // Create data directory if it doesn't exist
        if (!fs.existsSync(path.join(__dirname, '../data'))) {
            fs.mkdirSync(path.join(__dirname, '../data'));
        }
        
        // Save users data
        fs.writeFileSync(
            path.join(__dirname, '../data/users.json'),
            JSON.stringify(users, null, 2)
        );
        
        // Save rooms data
        fs.writeFileSync(
            path.join(__dirname, '../data/rooms.json'),
            JSON.stringify(rooms, null, 2)
        );
    } catch (error) {
        console.error('Error saving data:', error);
    }
}