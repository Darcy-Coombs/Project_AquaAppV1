export type PeerInfo = {
  url: string;
  connected: boolean;
  lastSeen?: number;
};

export class PeerBook {
  peers = new Map<string, PeerInfo>();

  set(url: string, connected: boolean) {
    const peer = this.peers.get(url) ?? { url, connected: false };
    peer.connected = connected;
    peer.lastSeen = Date.now();
    this.peers.set(url, peer);
  }

  all() {
    return [...this.peers.values()].sort((a, b) => a.url.localeCompare(b.url));
  }
}
