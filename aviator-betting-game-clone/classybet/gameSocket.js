/**
 * WebSocket Client for Real-Time Game Connection
 * Connects to centralized backend game session
 */

class GameSocketClient {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.currentGameState = null;
        this.onStateUpdate = null;
        this.onBetPlaced = null;
        this.onCashoutResult = null;
        this.reconnectionAttempts = 0;
        this.maxReconnectionAttempts = 20;
        this.baseReconnectionDelay = 1000;
        this.maxReconnectionDelay = 30000;
        this.isReconnecting = false;
        this.heartbeatInterval = null;
    }

    /**
     * Connect to backend WebSocket server
     */
    connect(serverUrl) {
        return new Promise((resolve, reject) => {
            try {
                // Load socket.io client from CDN if not already loaded
                if (typeof io === 'undefined') {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
                    script.onload = () => {
                        this.initializeSocket(serverUrl);
                        resolve();
                    };
                    script.onerror = reject;
                    document.head.appendChild(script);
                } else {
                    this.initializeSocket(serverUrl);
                    resolve();
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Initialize socket connection
     */
    initializeSocket(serverUrl) {
        this.socket = io(serverUrl, {
            transports: ['websocket', 'polling'],
            reconnection: false, // We'll handle reconnection manually for better control
            timeout: 10000,
            forceNew: true
        });

        // Connection events
        this.socket.on('connect', () => {
            console.log('🔌 Connected to game server');
            this.connected = true;
            this.reconnectionAttempts = 0;
            this.isReconnecting = false;
            
            // Start heartbeat to detect connection issues early
            this.startHeartbeat();
        });

        this.socket.on('disconnect', (reason) => {
            console.log('🔌 Disconnected from game server:', reason);
            this.connected = false;
            this.stopHeartbeat();
            
            // Only attempt reconnection if it wasn't intentional
            if (reason !== 'io client disconnect' && !this.isReconnecting) {
                this.attemptReconnect(serverUrl);
            }
        });

        this.socket.on('connect_error', (error) => {
            console.error('🔌 Connection error:', error.message || error);
            this.connected = false;
            
            if (!this.isReconnecting) {
                this.attemptReconnect(serverUrl);
            }
        });

        // Game state updates
        this.socket.on('game-state', (state) => {
            this.currentGameState = state;
            if (this.onStateUpdate) {
                this.onStateUpdate(state);
            }
        });

        // Bet placement response
        this.socket.on('bet-placed', (result) => {
            if (this.onBetPlaced) {
                this.onBetPlaced(result);
            }
        });

        this.socket.on('bet-error', (error) => {
            console.error('❌ Bet error:', error);
            if (this.onBetPlaced) {
                this.onBetPlaced({ success: false, error: error.error });
            }
        });

        // Cashout response
        this.socket.on('cashout-result', (result) => {
            console.log('💸 Cashout result received:', result);
            if (this.onCashoutResult) {
                this.onCashoutResult(result);
                this.onCashoutResult = null; // Clear callback after use
            }
        });

        this.socket.on('cashout-error', (error) => {
            console.error('❌ Cashout error:', error);
            if (this.onCashoutResult) {
                this.onCashoutResult({ success: false, error: error.error });
                this.onCashoutResult = null; // Clear callback after use
            }
        });
    }

    /**
     * Attempt to reconnect with exponential backoff
     */
    attemptReconnect(serverUrl) {
        if (this.reconnectionAttempts >= this.maxReconnectionAttempts) {
            console.error('🔌 Max reconnection attempts reached. Giving up.');
            return;
        }

        this.isReconnecting = true;
        this.reconnectionAttempts++;
        
        const delay = this.getReconnectionDelay();
        console.log(`🔌 Reconnection attempt ${this.reconnectionAttempts}/${this.maxReconnectionAttempts} in ${Math.round(delay)}ms`);

        setTimeout(() => {
            if (this.socket) {
                this.socket.disconnect();
            }
            this.initializeSocket(serverUrl);
        }, delay);
    }

    /**
     * Calculate exponential backoff delay
     */
    getReconnectionDelay() {
        const delay = Math.min(
            this.baseReconnectionDelay * Math.pow(2, this.reconnectionAttempts),
            this.maxReconnectionDelay
        );
        // Add jitter to prevent thundering herd
        return delay + Math.random() * 1000;
    }

    /**
     * Start heartbeat to detect connection issues
     */
    startHeartbeat() {
        this.stopHeartbeat(); // Clear any existing interval
        
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.connected) {
                // Send a ping or check connection status
                this.socket.emit('ping');
            }
        }, 25000); // Send heartbeat every 25 seconds
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Place a bet
     */
    placeBet(userId, amount, autoCashout = null, token = null) {
        if (!this.connected) {
            return Promise.reject(new Error('Not connected to game server'));
        }

        return new Promise((resolve) => {
            this.onBetPlaced = resolve;
            this.socket.emit('place-bet', {
                userId,
                amount,
                autoCashout,
                token  // Add token for authentication
            });
        });
    }

    /**
     * Request cashout
     */
    cashout(userId, betId, multiplier) {
        if (!this.connected) {
            return Promise.reject(new Error('Not connected to game server'));
        }

        return new Promise((resolve) => {
            this.onCashoutResult = resolve;
            this.socket.emit('cashout', { userId, betId, multiplier });
        });
    }

    /**
     * Get current game state
     */
    getState() {
        return this.currentGameState;
    }

    /**
     * Disconnect from server
     */
    disconnect() {
        this.stopHeartbeat();
        if (this.socket) {
            this.socket.disconnect();
            this.connected = false;
        }
        this.isReconnecting = false;
        this.reconnectionAttempts = 0;
    }
}

// Create global instance
window.gameSocket = new GameSocketClient();
