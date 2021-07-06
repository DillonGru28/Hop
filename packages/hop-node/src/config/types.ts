export interface Network {
  networkId: number
  rpcUrls: string[]
  readRpcUrl?: string
  explorerUrls: string[]
  waitConfirmations?: number
}

export interface Networks {
  [key: string]: Network
}
