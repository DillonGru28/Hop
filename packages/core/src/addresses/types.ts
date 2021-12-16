export type Bridges = {
  [tokenSymbol: string]: Partial<{
    ethereum: {
      l1CanonicalToken: string
      l1Bridge: string
      bridgeDeployedBlockNumber: number
    }
    arbitrum: {
      l1CanonicalBridge: string
      l1MessengerWrapper: string
      l2CanonicalBridge: string
      l2CanonicalToken: string
      l2Bridge: string
      l2HopBridgeToken: string
      l2AmmWrapper: string
      l2SaddleSwap: string
      l2SaddleLpToken: string
      bridgeDeployedBlockNumber: number
    }
    optimism: {
      l1CanonicalBridge: string
      l1MessengerWrapper: string
      l2CanonicalBridge: string
      l2CanonicalToken: string
      l2Bridge: string
      l2HopBridgeToken: string
      l2AmmWrapper: string
      l2SaddleSwap: string
      l2SaddleLpToken: string
      bridgeDeployedBlockNumber: number
    }
    polygon: {
      l1CanonicalBridge: string
      l1MessengerWrapper: string
      l2CanonicalBridge: string
      l2CanonicalToken: string
      l2Bridge: string
      l2HopBridgeToken: string
      l2AmmWrapper: string
      l2SaddleSwap: string
      l2SaddleLpToken: string
      l1FxBaseRootTunnel: string
      l1PosRootChainManager: string
      l1PosPredicate: string
      bridgeDeployedBlockNumber: number
    }
    xdai: {
      l1CanonicalBridge: string
      l1MessengerWrapper: string
      l2CanonicalBridge: string
      l2CanonicalToken: string
      l2Bridge: string
      l2HopBridgeToken: string
      l2AmmWrapper: string
      l2SaddleSwap: string
      l2SaddleLpToken: string
      l1Amb: string
      l2Amb: string
      bridgeDeployedBlockNumber: number
    }
  }>
}

export type Routes = {
  ethereum?: {
    optimism?: string
    arbitrum?: string
    xdai?: string
    polygon?: string
  },
  optimism?: {
    ethereum?: string
    arbitrum?: string
    xdai?: string
    polygon?: string
  },
  arbitrum?: {
    ethereum?: string
    optimism?: string
    xdai?: string
    polygon?: string
  },
  xdai?: {
    ethereum?: string
    arbitrum?: string
    optimism?: string
    polygon?: string
  },
  polygon?: {
    ethereum?: string
    arbitrum?: string
    xdai?: string
    optimism?: string
  }
}

export type Bonders = {
  USDC?: Routes
  USDT?: Routes
  DAI?: Routes
  MATIC?: Routes
  ETH?: Routes
  WBTC?: Routes
}

type Bps = {
  ethereum: number
  polygon: number
  xdai: number
  optimism: number
  arbitrum: number
}

export type Fees = {
  USDC?: Bps
  USDT?: Bps
  DAI?: Bps
  MATIC?: Bps
  ETH?: Bps
  WBTC?: Bps
}

export type Addresses = {
  bridges: Bridges
  bonders: Bonders
  bonderFeeBps?: Fees
  gasPriceMultiplier?: number
}
