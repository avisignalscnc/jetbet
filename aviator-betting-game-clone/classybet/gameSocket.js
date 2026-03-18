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
        this.onFakeBetPlaced = null;
        this.onFakeBetCashedOut = null;
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
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 10
        });

        // Connection events
        this.socket.on('connect', () => {
            console.log('🔌 Connected to game server');
            this.connected = true;
        });

        this.socket.on('disconnect', () => {
            console.log('🔌 Disconnected from game server');
            this.connected = false;
        });

        this.socket.on('connect_error', (error) => {
            console.error('🔌 Connection error:', error);
        });

        // Game state updates
        this.socket.on('game-state', (state) => {
            this.currentGameState = state;
            if (this.onStateUpdate) {
                this.onStateUpdate(state);
            }
        });

        // Fake bet events from server
        this.socket.on('fake-bet-placed', (bet) => {
            if (this.onFakeBetPlaced) {
                this.onFakeBetPlaced(bet);
            }
        });

        this.socket.on('fake-bet-cashed-out', (data) => {
            if (this.onFakeBetCashedOut) {
                this.onFakeBetCashedOut(data);
            }
        });
    }

    /**
     * Place a bet
     */
    placeBet(userId, amount, autoCashout = null, token = null) {
        if (!this.connected) {
            return Promise.reject(new Error('Not connected to game server'));
        }

        return new Promise((resolve, reject) => {
            // Set timeout to prevent hanging promises
            const timeout = setTimeout(() => {
                reject(new Error('Bet placement timeout'));
            }, 5000);

            // Create a one-time listener for this specific bet
            const handleBetPlaced = (result) => {
                clearTimeout(timeout);
                this.socket.off('bet-placed', handleBetPlaced);
                this.socket.off('bet-error', handleBetError);
                console.log('[SOCKET] bet-placed received:', result);
                resolve(result);
            };

            const handleBetError = (error) => {
                clearTimeout(timeout);
                this.socket.off('bet-placed', handleBetPlaced);
                this.socket.off('bet-error', handleBetError);
                console.error('[SOCKET] bet-error received:', error);
                resolve({ success: false, error: error.error });
            };

            // Listen for response
            this.socket.once('bet-placed', handleBetPlaced);
            this.socket.once('bet-error', handleBetError);

            // Emit bet placement
            console.log('[SOCKET] Emitting place-bet:', { userId, amount, autoCashout });
            this.socket.emit('place-bet', {
                userId,
                amount,
                autoCashout,
                token
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

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Cashout timeout')), 5000);
            
            const handleCashoutResult = (result) => {
                clearTimeout(timeout);
                this.socket.off('cashout-result', handleCashoutResult);
                this.socket.off('cashout-error', handleCashoutError);
                resolve(result);
            };
            
            const handleCashoutError = (error) => {
                clearTimeout(timeout);
                this.socket.off('cashout-result', handleCashoutResult);
                this.socket.off('cashout-error', handleCashoutError);
                resolve({ success: false, error: error.error || 'Cashout failed' });
            };
            
            this.socket.once('cashout-result', handleCashoutResult);
            this.socket.once('cashout-error', handleCashoutError);
            
            // Emit cashout
            console.log('[SOCKET] Emitting cashout:', { userId, betId, multiplier });
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
        if (this.socket) {
            this.socket.disconnect();
            this.connected = false;
        }
    }
}

// Create global instance
window.gameSocket = new GameSocketClient();
