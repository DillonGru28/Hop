export enum Network {
  Mainnet = 'mainnet',
  Staging = 'staging',
  Goerli = 'goerli',
  Kovan = 'kovan'
}

export enum Chain {
  Ethereum = 'ethereum',
  Optimism = 'optimism',
  Arbitrum = 'arbitrum',
  Polygon = 'polygon',
  xDai = 'xdai'
}

export enum TokenIndex {
  CanonicalToken = 0,
  HopBridgeToken = 1
}

export enum BondTransferGasLimit {
  Ethereum = '150000',
  Optimism = '80000000'
}

export const LpFee = '0.0004'
