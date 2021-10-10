import ContractBase from './ContractBase'
import rateLimitRetry from 'src/utils/rateLimitRetry'
import { BigNumber } from 'ethers'
import { TokenIndex } from 'src/constants'

export default class L2Amm extends ContractBase {
  calculateToHTokensAmount = rateLimitRetry(async (amountIn: BigNumber): Promise<BigNumber> => {
    const hTokenAmount = await this.contract.calculateSwap(
      TokenIndex.CanonicalToken,
      TokenIndex.HopBridgeToken,
      amountIn
    )
    return hTokenAmount
  })

  async calculateFromHTokensAmount (amountIn: BigNumber):Promise<BigNumber> {
    const amountOut = await this.contract.calculateSwap(
      TokenIndex.HopBridgeToken,
      TokenIndex.CanonicalToken,
      amountIn
    )
    return amountOut
  }
}
