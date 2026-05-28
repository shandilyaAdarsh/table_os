export interface RealtimeTransportAdapter {
  connect(topic: string, onMessage: (payload: any) => void, onStatusChange: (status: 'CONNECTED' | 'DISCONNECTED') => void): void;
  disconnect(): void;
  get connectionState(): 'CONNECTED' | 'DISCONNECTED';
}
