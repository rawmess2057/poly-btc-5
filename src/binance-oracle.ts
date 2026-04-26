// @ts-ignore
import WebSocket from 'ws';

export type StrikeCrossCallback = (price: number, direction: 'UP' | 'DOWN') => void;

export class BinanceOracle {
  private ws: WebSocket | null = null;
  private readonly url = 'wss://stream.binance.com:9443/ws/btcusdt@aggTrade';
  private wasAboveStrike: boolean | null = null;
  private isConnected = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly strikePrice: number,
    private readonly onCrossStrike: StrikeCrossCallback
  ) {}

  start() {
    if (this.ws || isNaN(this.strikePrice) || this.strikePrice <= 0) {
      if (!this.ws) {
        console.warn('⚠️ Invalid STRIKE_PRICE provided to Binance Oracle. Oracle disabled.');
      }
      return;
    }

    this.connect();
  }

  private connect() {
    console.log('🔗 Connecting to Binance Price Oracle...');
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      this.isConnected = true;
      console.log('✅ Binance Oracle connected. Monitoring BTC price against strike:', this.strikePrice);
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.e === 'aggTrade' && payload.p) {
          this.handlePriceUpdate(parseFloat(payload.p));
        }
      } catch (err) {
        // Ignore parse errors
      }
    });

    this.ws.on('close', () => {
      console.warn('⚠️ Binance Oracle disconnected. Reconnecting in 3s...');
      this.isConnected = false;
      this.cleanup();
      this.scheduleReconnect();
    });

    this.ws.on('error', (err: any) => {
      console.error('❌ Binance Oracle error:', err.message);
      this.ws?.close();
    });
  }

  private handlePriceUpdate(price: number) {
    const isAbove = price > this.strikePrice;

    if (this.wasAboveStrike === null) {
      // First price received, establish baseline
      this.wasAboveStrike = isAbove;
      return;
    }

    if (this.wasAboveStrike === true && !isAbove) {
      // Crossed DOWN through strike
      this.wasAboveStrike = false;
      this.onCrossStrike(price, 'DOWN');
    } else if (this.wasAboveStrike === false && isAbove) {
      // Crossed UP through strike
      this.wasAboveStrike = true;
      this.onCrossStrike(price, 'UP');
    }
  }

  private scheduleReconnect() {
    if (!this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connect();
      }, 3000);
    }
  }

  private cleanup() {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
  }

  close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.cleanup();
    this.isConnected = false;
    console.log('🛑 Binance Oracle stopped.');
  }

  isOnline() {
    return this.isConnected;
  }
}
