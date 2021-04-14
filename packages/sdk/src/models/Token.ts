import { ethers } from 'ethers'

class Token {
  public readonly chainId: number
  public readonly address: string
  public readonly decimals: number = 18
  public readonly symbol: string = ''
  public readonly name: string = ''

  static USDC = 'USDC'
  static DAI = 'DAI'
  static WBTC = 'WBTC'
  static sBTC = 'sBTC'
  static sETH = 'sETH'

  constructor (
    chainId: number | string,
    address: string,
    decimals: number,
    symbol: string,
    name: string
  ) {
    if (chainId) {
      this.chainId = Number(chainId)
    }
    if (address) {
      this.address = ethers.utils.getAddress(address)
    }
    if (decimals) {
      this.decimals = decimals
    }
    if (symbol) {
      this.symbol = symbol
    }
    if (name) {
      this.name = name
    }
  }
}

export default Token
