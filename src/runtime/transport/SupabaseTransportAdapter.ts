import { RealtimeTransportAdapter } from './TransportAdapter';

export class SupabaseTransportAdapter implements RealtimeTransportAdapter {
  private supabaseClient: any;
  private channel: any = null;
  private currentState: 'CONNECTED' | 'DISCONNECTED' = 'DISCONNECTED';

  constructor(supabaseClient: any) {
    this.supabaseClient = supabaseClient;
  }

  public connect(topic: string, onMessage: (payload: any) => void, onStatusChange: (status: 'CONNECTED' | 'DISCONNECTED') => void): void {
    if (this.channel) {
      this.disconnect();
    }

    this.channel = this.supabaseClient.channel(topic);

    this.channel
      .on('broadcast', { event: '*' }, (payload: any) => {
        onMessage(payload.payload);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          this.currentState = 'CONNECTED';
          onStatusChange('CONNECTED');
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          this.currentState = 'DISCONNECTED';
          onStatusChange('DISCONNECTED');
        }
      });
  }

  public disconnect(): void {
    if (this.channel) {
      this.supabaseClient.removeChannel(this.channel);
      this.channel = null;
    }
    this.currentState = 'DISCONNECTED';
  }

  public get connectionState(): 'CONNECTED' | 'DISCONNECTED' {
    return this.currentState;
  }
}
