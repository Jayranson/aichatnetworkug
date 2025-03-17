/**
 * AI Chat Network
 * Enhanced chat room functionality
 */

// Global variables
let currentUser = null;
let currentRoom = null;
let webSocket = null;
let lastMessageTimes = {};
let selectedUserId = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 10;
let reconnectDelay = 2000; // milliseconds

// Constants
const MAX_MESSAGES = 200;
const TYPING_TIMEOUT = 2000;

// Initialize when document is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Setup UI elements
    setupUI();
    
    // Get current user from local storage
    const userData = localStorage.getItem('currentUser');
    if (userData) {
        try {
            currentUser = JSON.parse(userData);
        } catch (e) {
            console.error('Error parsing current user data:', e);
            // Redirect to login if user data is invalid
            window.location.href = '/login';
            return;
        }
    } else {
        // Redirect to login if no user data
        window.location.href = '/login';
        return;
    }
    
    // Connect to WebSocket server
    connectWebSocket();
    
    // Add event listeners
    addEventListeners();
    
    // Update online status when page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Initialize context menu
    initContextMenu();
    
    // Show welcome message
    showNotification('Welcome to AI Chat Network', 'success');
});

// Setup UI elements
function setupUI() {
    // Enhanced button styling
    const roomSettingsBtn = document.getElementById('roomSettingsBtn');
    if (roomSettingsBtn) {
        roomSettingsBtn.className = 'action-button';
        roomSettingsBtn.innerHTML = '<i class="fas fa-cog"></i> Room Settings';
    }
    
    const leaveRoomBtn = document.getElementById('leaveRoomBtn');
    if (leaveRoomBtn) {
        leaveRoomBtn.className = 'action-button leave-btn';
        leaveRoomBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Leave Room';
    }
    
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    if (sendMessageBtn) {
        sendMessageBtn.className = 'send-button';
        sendMessageBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
    
    // Create live indicator
    let liveIndicator = document.getElementById('liveIndicator');
    if (!liveIndicator) {
        liveIndicator = document.createElement('div');
        liveIndicator.id = 'liveIndicator';
        document.body.appendChild(liveIndicator);
    }
    liveIndicator.innerHTML = '<span class="pulse"></span> LIVE';
    liveIndicator.className = 'live-indicator';
    
    // Initialize whisper window container
    let whisperContainer = document.getElementById('whisperWindows');
    if (!whisperContainer) {
        whisperContainer = document.createElement('div');
        whisperContainer.id = 'whisperWindows';
        document.body.appendChild(whisperContainer);
    }
    
    // Add CSS for UI enhancements
    addCSS(`
        .action-button {
            padding: 8px 12px;
            background-color: #4a5568;
            color: white;
            border: none;
            border-radius: 4px;
            margin-left: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            transition: background-color 0.2s;
        }
        
        .action-button:hover {
            background-color: #2d3748;
        }
        
        .action-button i {
            margin-right: 5px;
        }
        
        .leave-btn {
            background-color: #e53e3e;
        }
        
        .leave-btn:hover {
            background-color: #c53030;
        }
        
        .send-button {
            background-color: #4299e1;
            color: white;
            border: none;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        
        .send-button:hover {
            background-color: #3182ce;
        }
        
        .live-indicator {
            display: flex;
            align-items: center;
            background-color: rgba(0, 0, 0, 0.5);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            position: fixed;
            top: 10px;
            right: 10px;
            font-size: 12px;
            z-index: 9999;
            opacity: 1;
            transition: opacity 0.5s;
        }
        
        .live-indicator.fade {
            opacity: 0;
        }
        
        .pulse {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #ff3b30;
            margin-right: 5px;
            animation: pulse 1.5s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.3; }
            100% { opacity: 1; }
        }
        
        .context-menu {
            position: absolute;
            background-color: white;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            display: none;
            z-index: 1000;
        }
        
        .context-option {
            padding: 8px 12px;
            cursor: pointer;
        }
        
        .context-option:hover {
            background-color: #f7fafc;
        }
        
        #whisperWindows {
            position: fixed;
            bottom: 10px;
            right: 10px;
            z-index: 1000;
            display: flex;
            flex-direction: column-reverse;
            gap: 10px;
        }
        
        .whisper-window {
            width: 300px;
            height: 300px;
            background-color: #fff;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            resize: both;
            min-width: 250px;
            min-height: 200px;
            max-width: 500px;
            max-height: 500px;
        }
        
        .whisper-header {
            padding: 8px 12px;
            background-color: #4a5568;
            color: white;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: move;
        }
        
        .whisper-title {
            font-weight: bold;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .whisper-close {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 18px;
        }
        
        .whisper-messages {
            flex: 1;
            padding: 12px;
            overflow-y: auto;
            background-color: #f7fafc;
        }
        
        .whisper-input-container {
            display: flex;
            border-top: 1px solid #e2e8f0;
            padding: 8px;
        }
        
        .whisper-input {
            flex: 1;
            padding: 8px;
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            resize: none;
            height: 36px;
        }
        
        .whisper-send {
            background-color: #4299e1;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 0 12px;
            margin-left: 8px;
            cursor: pointer;
        }
        
        .whisper-message {
            margin-bottom: 8px;
            padding: 8px 12px;
            border-radius: 8px;
            max-width: 80%;
            word-break: break-word;
        }
        
        .whisper-message.sent {
            background-color: #c6f6d5;
            align-self: flex-end;
            margin-left: auto;
        }
        
        .whisper-message.received {
            background-color: #e2e8f0;
            align-self: flex-start;
        }
        
        .whisper-timestamp {
            font-size: 10px;
            color: #718096;
            margin-top: 4px;
            text-align: right;
        }
        
        .role-icon {
            display: inline-block;
            margin-right: 4px;
        }
        
        .role-icon.admin {
            color: #FFD700;
        }
        
        .role-icon.owner {
            color: #FFA500;
        }
        
        .role-icon.host {
            color: #4299E1;
        }
        
        .ai-message {
            background-color: #EBF8FF;
            border-left: 3px solid #4299E1;
        }
        
        .system-message {
            background-color: #F0FFF4;
            border-left: 3px solid #48BB78;
            text-align: center;
            font-style: italic;
        }
        
        .poll-message {
            background-color: #F7FAFC;
            border: 1px solid #E2E8F0;
            border-radius: 8px;
            padding: 12px;
            margin: 8px 0;
        }
        
        .poll-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
        }
        
        .poll-title {
            font-weight: bold;
        }
        
        .poll-option {
            margin-bottom: 8px;
        }
        
        .poll-progress {
            background-color: #EDF2F7;
            border-radius: 9999px;
            height: 8px;
            margin-top: 4px;
            overflow: hidden;
        }
        
        .poll-progress-bar {
            background-color: #4299E1;
            height: 100%;
            transition: width 0.5s;
        }
        
        .poll-vote-count {
            font-size: 12px;
            color: #718096;
            margin-top: 2px;
        }
    `);
    
    // Auto-hide live indicator after 5 seconds
    setTimeout(() => {
        liveIndicator.classList.add('fade');
    }, 5000);
}

// Helper function to add CSS
function addCSS(cssText) {
    const style = document.createElement('style');
    style.textContent = cssText;
    document.head.appendChild(style);
}

// Add event listeners
function addEventListeners() {
    // Send message button
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const messageInput = document.getElementById('messageInput');
    
    if (sendMessageBtn && messageInput) {
        sendMessageBtn.addEventListener('click', () => {
            sendMessage();
        });
        
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
    
    // Room settings button
    const roomSettingsBtn = document.getElementById('roomSettingsBtn');
    const roomSettingsModal = document.getElementById('roomSettingsModal');
    
    if (roomSettingsBtn && roomSettingsModal) {
        roomSettingsBtn.addEventListener('click', function() {
            showRoomSettings();
        });
        
        // Close modal when clicking outside
        roomSettingsModal.addEventListener('click', function(e) {
            if (e.target === roomSettingsModal) {
                roomSettingsModal.style.display = 'none';
            }
        });
    }
    
    // Create room button
    const createRoomBtn = document.getElementById('createRoomBtn');
    const createRoomModal = document.getElementById('createRoomModal');
    
    if (createRoomBtn && createRoomModal) {
        createRoomBtn.addEventListener('click', function() {
            createRoomModal.style.display = 'flex';
        });
        
        // Close modal when clicking outside
        createRoomModal.addEventListener('click', function(e) {
            if (e.target === createRoomModal) {
                createRoomModal.style.display = 'none';
            }
        });
    }
    
    // Leave room button
    const leaveRoomBtn = document.getElementById('leaveRoomBtn');
    
    if (leaveRoomBtn) {
        leaveRoomBtn.addEventListener('click', function() {
            leaveCurrentRoom();
        });
    }
    
    // Room settings form
    const updateRoomForm = document.getElementById('updateRoomForm');
    
    if (updateRoomForm) {
        updateRoomForm.addEventListener('submit', function(e) {
            e.preventDefault();
            updateRoomSettings();
        });
        
        // Toggle password field visibility
        const privateCheckbox = document.getElementById('updateRoomPrivate');
        if (privateCheckbox) {
            privateCheckbox.addEventListener('change', function() {
                document.getElementById('updatePasswordField').style.display = 
                    this.checked ? 'block' : 'none';
            });
        }
    }
    
    // Create room form
    const createRoomForm = document.getElementById('createRoomForm');
    
    if (createRoomForm) {
        createRoomForm.addEventListener('submit', function(e) {
            e.preventDefault();
            createNewRoom();
        });
        
        // Toggle password field visibility
        const roomPrivateCheckbox = document.getElementById('roomPrivate');
        const roomPasswordField = document.getElementById('roomPasswordField');
        
        if (roomPrivateCheckbox && roomPasswordField) {
            roomPasswordField.style.display = roomPrivateCheckbox.checked ? 'block' : 'none';
            
            roomPrivateCheckbox.addEventListener('change', function() {
                roomPasswordField.style.display = this.checked ? 'block' : 'none';
            });
        }
    }
}

// Initialize context menu
function initContextMenu() {
    let contextMenu = document.getElementById('contextMenu');
    
    if (!contextMenu) {
        contextMenu = document.createElement('div');
        contextMenu.id = 'contextMenu';
        contextMenu.className = 'context-menu';
        contextMenu.innerHTML = `
            <div class="context-option" data-action="whisper">Whisper</div>
            <div class="context-option" data-action="viewProfile">View Profile</div>
            <div class="context-option" data-action="mute">Mute</div>
            <div class="context-option" data-action="block">Block</div>
            <div class="context-option" data-action="kick">Kick</div>
            <div class="context-option" data-action="ban">Ban</div>
        `;
        document.body.appendChild(contextMenu);
    }
}