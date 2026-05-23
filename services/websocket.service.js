(function (global) {
  class ManagedWebSocket {
    constructor(url, {
      protocols,
      reconnect = false,
      reconnectDelay = 1500,
      maxReconnectDelay = 15000,
      onOpen,
      onMessage,
      onError,
      onClose,
      WebSocketCtor = WebSocket
    } = {}) {
      this.url = url;
      this.protocols = protocols;
      this.reconnect = reconnect;
      this.reconnectDelay = reconnectDelay;
      this.maxReconnectDelay = maxReconnectDelay;
      this.onOpen = onOpen;
      this.onMessage = onMessage;
      this.onError = onError;
      this.onClose = onClose;
      this.WebSocketCtor = WebSocketCtor;
      this.socket = null;
      this.closedByUser = false;
      this.reconnectTimer = null;
      this.reconnectAttempts = 0;
    }

    connect() {
      this.closedByUser = false;
      this.clearReconnectTimer();

      this.socket = this.protocols
        ? new this.WebSocketCtor(this.url, this.protocols)
        : new this.WebSocketCtor(this.url);

      const socket = this.socket;

      socket.onopen = event => {
        this.reconnectAttempts = 0;
        if (this.onOpen) this.onOpen(event, this);
      };

      socket.onmessage = event => {
        if (this.onMessage) this.onMessage(event, this);
      };

      socket.onerror = event => {
        if (this.onError) this.onError(event, this);
      };

      socket.onclose = event => {
        if (this.onClose) this.onClose(event, this);
        if (this.reconnect && !this.closedByUser) {
          this.scheduleReconnect();
        }
      };

      return socket;
    }

    disconnect(code, reason) {
      this.closedByUser = true;
      this.clearReconnectTimer();

      if (!this.socket) return;

      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;

      if (
        this.socket.readyState === WebSocket.CONNECTING ||
        this.socket.readyState === WebSocket.OPEN
      ) {
        this.socket.close(code, reason);
      }

      this.socket = null;
    }

    send(data) {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        throw new Error("WebSocket is not open");
      }

      this.socket.send(typeof data === "string" ? data : JSON.stringify(data));
    }

    get readyState() {
      return this.socket ? this.socket.readyState : WebSocket.CLOSED;
    }

    scheduleReconnect() {
      this.clearReconnectTimer();
      this.reconnectAttempts += 1;
      const delay = Math.min(
        this.maxReconnectDelay,
        this.reconnectDelay * Math.max(1, this.reconnectAttempts)
      );

      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }

    clearReconnectTimer() {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }
  }

  class WebSocketService {
    constructor({ WebSocketCtor = WebSocket } = {}) {
      this.WebSocketCtor = WebSocketCtor;
    }

    createWebSocket(url, protocols) {
      return protocols
        ? new this.WebSocketCtor(url, protocols)
        : new this.WebSocketCtor(url);
    }

    connect(url, options = {}) {
      const connection = new ManagedWebSocket(url, {
        ...options,
        WebSocketCtor: this.WebSocketCtor
      });

      connection.connect();
      return connection;
    }
  }

  global.ManagedWebSocket = ManagedWebSocket;
  global.WebSocketService = WebSocketService;
  global.websocketService = new WebSocketService();
})(window);
