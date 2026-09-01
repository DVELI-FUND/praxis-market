// Global chain context — mirrors old frontend's window.currentHeight/ChainID/NetworkID
let _height = 0;
let _chainId = 1;
let _networkId = 1;

export function setChainContext(height: number, chainId?: number, networkId?: number) {
  _height = height || _height;
  _chainId = chainId || _chainId;
  _networkId = networkId || _networkId;
}

export function getChainContext() {
  return { height: _height, chainId: _chainId, networkId: _networkId };
}
