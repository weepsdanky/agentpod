export function createPeerCache<T>(initialPeers: T[] = []) {
  let peers = [...initialPeers];

  return {
    list() {
      return peers;
    },
    replace(nextPeers: T[]) {
      peers = [...nextPeers];
    }
  };
}
