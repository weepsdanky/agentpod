export function createPeerCache(initialPeers: Array<Record<string, unknown>> = []) {
  let peers = [...initialPeers];

  return {
    list() {
      return peers;
    },
    replace(nextPeers: Array<Record<string, unknown>>) {
      peers = [...nextPeers];
    }
  };
}
