/**
 * AI Chat Network
 * Enhanced server with AI commands and room management
 */

// Import required modules
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Import configuration
const config = require('./config');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ noServer: true });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// In-memory data storage (replace with database in production)
const users = [];
const rooms = [];
const connectedUsers = [];

// Load initial data
loadData();

// API Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/register.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/profile.html'));
});

app.get('/chat-room', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/chat-room.html'));
});

// Authentication endpoints
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // Validate input
        if (!username || !email || !password) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        // Check if username already exists
        if (users.some(user => user.username.toLowerCase() === username.toLowerCase())) {
            return res.status(400).json({ success: false, message: 'Username already taken' });
        }
        
        // Check if email already exists
        if (users.some(user => user.email.toLowerCase() === email.toLowerCase())) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user
        const newUser = {
            id: `user-${uuidv4()}`,
            username,
            email,
            password: hashedPassword,
            roles: ['user'],
            created: Date.now(),
            avatar: null,
            bio: '',
            settings: {
                theme: 'light',
                notifications: true
            }
        };
        
        // Add user to array
        users.push(newUser);
        
        // Save data
        saveData();
        
        // Generate token
        const token = jwt.sign(
            { id: newUser.id, username: newUser.username, roles: newUser.roles },
            config.jwtSecret,
            { expiresIn: '24h' }
        );
        
        // Return user data and token
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                roles: newUser.roles,
                avatar: newUser.avatar,
                bio: newUser.bio,
                settings: newUser.settings
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Validate input
        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Missing username or password' });
        }
        
        // Find user
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
        
        // Check password
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        if (!passwordMatch) {
            return res.status(401).json({ success: false, message: 'Invalid username or password' });
        }
        
        // Generate token
        const token = jwt.sign(
            { id: user.id, username: user.username, roles: user.roles },
            config.jwtSecret,
            { expiresIn: '24h' }
        );
        
        // Return user data and token
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                roles: user.roles,
                avatar: user.avatar,
                bio: user.bio,
                settings: user.settings
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Authentication token required' });
    }
    
    jwt.verify(token, config.jwtSecret, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid or expired token' });
        }
        
        req.user = user;
        next();
    });
}

// User API endpoints
app.get('/api/users/me', authenticateToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({
        success: true,
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            roles: user.roles,
            avatar: user.avatar,
            bio: user.bio,
            settings: user.settings
        }
    });
});

app.put('/api/users/me', authenticateToken, async (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Update fields
    const { bio, avatar, settings } = req.body;
    
    if (bio !== undefined) {
        user.bio = bio;
    }
    
    if (avatar !== undefined) {
        user.avatar = avatar;
    }
    
    if (settings !== undefined) {
        user.settings = { ...user.settings, ...settings };
    }
    
    // Save data
    saveData();
    
    res.json({
        success: true,
        message: 'User updated successfully',
        user: {
            id: user.id,
            username: user.username,
            email: user.email,
            roles: user.roles,
            avatar: user.avatar,
            bio: user.bio,
            settings: user.settings
        }
    });
});

app.put('/api/users/password', authenticateToken, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    
    const user = users.find(u => u.id === req.user.id);
    
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Check current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    
    if (!passwordMatch) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    user.password = hashedPassword;
    
    // Save data
    saveData();
    
    res.json({
        success: true,
        message: 'Password updated successfully'
    });
});