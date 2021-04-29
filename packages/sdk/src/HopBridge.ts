import { ethers, Signer, Contract, BigNumber } from 'ethers'
import { Chain } from './models'
import { addresses } from './config'
import {
  l1BridgeAbi,
  l2BridgeAbi,
  saddleLpTokenAbi,
  saddleSwapAbi,
  l2AmmWrapperAbi
} from '@hop-protocol/abi'
import TokenClass from './Token'
import { TChain, TToken, TAmount } from './types'
import Base from './Base'
import AMM from './AMM'
import _version from './version'
import { TokenIndex } from './constants'

type SendL1ToL1Input = {
  destinationChain: Chain
  sourceChain: Chain
  amount: number | string
}

type SendL1ToL2Input = {
  destinationChainId: number | string
  sourceChain: Chain
  relayer?: string
  relayerFee?: TAmount
  amount: TAmount
  amountOutMin?: TAmount
  deadline?: number
  recipient?: string
  approval?: boolean
}

type SendL2ToL1Input = {
  destinationChainId: number | string
  sourceChain: Chain
  amount: TAmount
  amountOutMin: TAmount
  destinationAmountOutMin?: TAmount
  deadline?: number
  destinationDeadline?: number
  bonderFee?: TAmount
  recipient?: string
  approval?: boolean
}

type SendL2ToL2Input = {
  destinationChainId: number | string
  sourceChain: Chain
  amount: number | string
  amountOutMin: TAmount
  destinationAmountOutMin?: TAmount
  bonderFee?: TAmount
  deadline?: number
  destinationDeadline?: number
  recipient?: string
  approval?: boolean
}

type SendOptions = {
  deadline: number
  relayer: string
  relayerFee: TAmount
  recipient: string
  amountOutMin: TAmount
  bonderFee: TAmount
  destinationAmountOutMin: TAmount
  destinationDeadline: number
}

/**
 * Class reprensenting Hop bridge.
 * @namespace HopBridge
 */
class HopBridge extends Base {
  /** Token class */
  public token: TokenClass

  /** Hop Token class */
  public hopToken: TokenClass

  /** Ethers Signer */
  public signer: Signer

  /** Source Chain model */
  public sourceChain: Chain

  /** Destination Chain model */
  public destinationChain: Chain

  /** Default deadline for transfers */
  public defaultDeadlineMinutes = 30

  /**
   * @desc Instantiates Hop Bridge.
   * Returns a new Hop Bridge instance.
   * @param {Object} signer - Ethers `Signer` for signing transactions.
   * @param {Object|String} token - Token symbol or model
   * @param {Object} sourceChain - Source chain model
   * @param {Object} destinationChain - Destination chain model
   * @example
   *```js
   *import { Hop } from '@hop-protocol/sdk'
   *
   *const hop = new Hop(signer)
   *```
   * @example
   *```js
   *import { Hop, Chain, Token } from '@hop-protocol/sdk'
   *import { Wallet } from 'ethers'
   *
   *const signer = new Wallet(privateKey)
   *const bridge = new HopBridge(signer, Token.USDC, Chain.Optimism, Chain.xDai)
   *```
   */
  constructor (
    network: string,
    signer: Signer,
    token: TToken,
    sourceChain?: TChain,
    destinationChain?: TChain
  ) {
    super(network)
    if (!token) {
      throw new Error('token symbol is required')
    }
    token = this.toTokenModel(token)
    if (signer) {
      this.signer = signer
    }
    if (sourceChain) {
      this.sourceChain = this.toChainModel(sourceChain)
    }
    if (destinationChain) {
      this.destinationChain = this.toChainModel(destinationChain)
    }

    this.token = new TokenClass(
      this.network,
      token.chainId,
      token.address,
      token.decimals,
      token.symbol,
      token.name,
      signer
    )
  }

  /**
   * @desc Returns hop bridge instance with signer connected. Used for adding or changing signer.
   * @param {Object} signer - Ethers `Signer` for signing transactions.
   * @example
   *```js
   *import { Hop, Token } from '@hop-protocol/sdk'
   *import { Wallet } from 'ethers'
   *
   *const signer = new Wallet(privateKey)
   *let hop = new Hop()
   * // ...
   *const bridge = hop.bridge(Token.USDC).connect(signer)
   *```
   */
  connect (signer: Signer) {
    return new HopBridge(
      this.network,
      signer,
      this.token,
      this.sourceChain,
      this.destinationChain
    )
  }

  /**
   * @desc Approve and send tokens to another chain. This will make an approval
   * transaction if not enough allowance.
   * @param {String} tokenAmount - Token amount to send denominated in smallest unit.
   * @param {Object} sourceChain - Source chain model.
   * @param {Object} destinationChain - Destination chain model.
   * @returns Transaction object.
   * @example
   *```js
   *import { Hop, Token } from '@hop-protocol/sdk'
   *
   *const hop = new Hop()
   *const bridge = hop.connect(signer).bridge(Token.USDC)
   *\// send 1 USDC token from Optimism -> xDai
   *const tx = await bridge.send('1000000000000000000', Chain.Optimism, Chain.xDai)
   *console.log(tx.hash)
   *```
   */
  async approveAndSend (
    tokenAmount: TAmount,
    sourceChain?: TChain,
    destinationChain?: TChain,
    options?: Partial<SendOptions>
  ) {
    return this._send(
      tokenAmount.toString(),
      sourceChain,
      destinationChain,
      true,
      options
    )
  }

  /**
   * @desc Send tokens to another chain.
   * @param {String} tokenAmount - Token amount to send denominated in smallest unit.
   * @param {Object} sourceChain - Source chain model.
   * @param {Object} destinationChain - Destination chain model.
   * @returns Transaction object.
   * @example
   *```js
   *import { Hop, Chain, Token } from '@hop-protocol/sdk'
   *
   *const hop = new Hop()
   *const bridge = hop.connect(signer).bridge(Token.USDC)
   *\// send 1 USDC token from Optimism -> xDai
   *const tx = await bridge.send('1000000000000000000', Chain.Optimism, Chain.xDai)
   *console.log(tx.hash)
   *```
   */
  async send (
    tokenAmount: TAmount,
    sourceChain?: TChain,
    destinationChain?: TChain,
    options?: Partial<SendOptions>
  ) {
    tokenAmount = tokenAmount.toString()
    if (!sourceChain) {
      sourceChain = this.sourceChain
    }
    if (!destinationChain) {
      destinationChain = this.destinationChain
    }
    if (!sourceChain) {
      throw new Error('source chain is required')
    }
    if (!destinationChain) {
      throw new Error('destination chain is required')
    }

    return this._send(
      tokenAmount.toString(),
      sourceChain,
      destinationChain,
      false,
      options
    )
  }

  private async _send (
    tokenAmount: string,
    sourceChain: TChain,
    destinationChain: TChain,
    approval: boolean = false,
    options?: Partial<SendOptions>
  ) {
    sourceChain = this.toChainModel(sourceChain)
    destinationChain = this.toChainModel(destinationChain)

    const balance = await this.token.balanceOf(sourceChain)
    if (balance.lt(BigNumber.from(tokenAmount))) {
      throw new Error('not enough token balance')
    }

    // L1 -> L1 or L2
    if (sourceChain.isL1) {
      // L1 -> L1
      if (destinationChain.isL1) {
        return this._sendL1ToL1({
          sourceChain,
          destinationChain,
          amount: tokenAmount
        })
      }
      // L1 -> L2
      return this._sendL1ToL2({
        destinationChainId: destinationChain.chainId,
        sourceChain,
        relayer: options?.relayer ?? ethers.constants.AddressZero,
        relayerFee: options?.relayerFee ?? 0,
        amount: tokenAmount,
        amountOutMin: options?.amountOutMin ?? 0,
        deadline: options?.deadline,
        recipient: options?.recipient,
        approval
      })
    }
    // else:
    // L2 -> L1 or L2

    // L2 -> L1
    if (destinationChain.isL1) {
      let bonderFee = options.bonderFee
      if (!bonderFee) {
        bonderFee = await this.getBonderFee(
          tokenAmount,
          sourceChain,
          destinationChain
        )
      }
      return this._sendL2ToL1({
        destinationChainId: destinationChain.chainId,
        sourceChain,
        amount: tokenAmount,
        bonderFee,
        recipient: options.recipient,
        amountOutMin: options.amountOutMin,
        deadline: options.deadline,
        destinationAmountOutMin: options.destinationAmountOutMin,
        destinationDeadline: options.destinationDeadline,
        approval
      })
    }

    // L2 -> L2
    let bonderFee = options.bonderFee
    if (!bonderFee) {
      bonderFee = await this.getBonderFee(
        tokenAmount,
        sourceChain,
        destinationChain
      )
    }
    return this._sendL2ToL2({
      destinationChainId: destinationChain.chainId,
      sourceChain,
      amount: tokenAmount,
      bonderFee,
      recipient: options.recipient,
      amountOutMin: options.amountOutMin,
      deadline: options.deadline,
      destinationAmountOutMin: options.destinationAmountOutMin,
      destinationDeadline: options.destinationDeadline,
      approval
    })
  }

  /**
   * @desc Estimate token amount out.
   * @param {String} tokenAmountIn - Token amount input.
   * @param {Object} sourceChain - Source chain model.
   * @param {Object} destinationChain - Destination chain model.
   * @returns BigNumber object.
   * @example
   *```js
   *import { Hop, Chain Token } from '@hop-protocol/sdk'
   *
   *const hop = new Hop()
   *const bridge = hop.connect(signer).bridge(Token.USDC)
   *const amountOut = await bridge.getAmountOut('1000000000000000000', Chain.Optimism, Chain.xDai)
   *console.log(amountOut)
   *```
   */
  async getAmountOut (
    tokenAmountIn: TAmount,
    sourceChain?: TChain,
    destinationChain?: TChain
  ) {
    tokenAmountIn = BigNumber.from(tokenAmountIn.toString())
    sourceChain = this.toChainModel(sourceChain)
    destinationChain = this.toChainModel(destinationChain)

    const hTokenAmount = await this._calcToHTokenAmount(
      tokenAmountIn,
      sourceChain
    )
    const amountOut = await this._calcFromHTokenAmount(
      hTokenAmount,
      destinationChain
    )

    return amountOut
  }

  /**
   * @desc Estimate the bonder liquidity needed at the destination.
   * @param {String} tokenAmountIn - Token amount input.
   * @param {Object} sourceChain - Source chain model.
   * @param {Object} destinationChain - Destination chain model.
   * @returns BigNumber object.
   * @example
   *```js
   *import { Hop, Chain Token } from '@hop-protocol/sdk'
   *
   *const hop = new Hop()
   *const bridge = hop.connect(signer).bridge(Token.USDC)
   *const requiredLiquidity = await bridge.getRequiredLiquidity('1000000000000000000', Chain.Optimism, Chain.xDai)
   *console.log(requiredLiquidity)
   *```
   */
  async getRequiredLiquidity (
    tokenAmountIn: TAmount,
    sourceChain?: TChain
  ): Promise<BigNumber> {
    tokenAmountIn = BigNumber.from(tokenAmountIn.toString())
    sourceChain = this.toChainModel(sourceChain)

    const hTokenAmount = await this._calcToHTokenAmount(
      tokenAmountIn,
      sourceChain
    )

    return hTokenAmount
  }

  private async _calcToHTokenAmount (
    amount: TAmount,
    chain: Chain
  ): Promise<BigNumber> {
    if (chain.isL1) {
      return BigNumber.from(amount)
    }

    const saddleSwap = await this.getSaddleSwap(chain, this.signer)

    return saddleSwap.calculateSwap(
      TokenIndex.CANONICAL_TOKEN,
      TokenIndex.HOP_BRIDGE_TOKEN,
      amount
    )
  }

  private async _calcFromHTokenAmount (
    amount: TAmount,
    chain: Chain
  ): Promise<BigNumber> {
    if (chain.isL1) {
      return BigNumber.from(amount)
    }

    const saddleSwap = await this.getSaddleSwap(chain, this.signer)

    return saddleSwap.calculateSwap(
      TokenIndex.HOP_BRIDGE_TOKEN,
      TokenIndex.CANONICAL_TOKEN,
      amount
    )
  }

  private async _sendL1ToL1 (input: SendL1ToL1Input) {
    const { sourceChain, amount } = input
    const recipient = await this.getSignerAddress()
    return this.token.transfer(sourceChain, recipient, amount)
  }

  private async _sendL1ToL2 (input: SendL1ToL2Input) {
    let {
      destinationChainId,
      sourceChain,
      relayer,
      relayerFee,
      amount,
      amountOutMin,
      deadline,
      recipient,
      approval
    } = input
    deadline = deadline || this.defaultDeadlineSeconds
    recipient = recipient || (await this.getSignerAddress())
    this.checkConnectedChain(this.signer, sourceChain)
    const l1Bridge = await this.getL1Bridge(this.signer)

    if (approval) {
      const tx = await this.token.approve(sourceChain, l1Bridge.address, amount)
      await tx?.wait()
    } else {
      const allowance = await this.token.allowance(
        sourceChain,
        l1Bridge.address
      )
      if (allowance.lt(BigNumber.from(amount))) {
        throw new Error('not enough allowance')
      }
    }

    return l1Bridge.sendToL2(
      destinationChainId,
      recipient,
      amount || 0,
      amountOutMin || 0,
      deadline,
      relayer,
      relayerFee || 0,
      this.txOverrides(Chain.Ethereum)
    )
  }

  private async _sendL2ToL1 (input: SendL2ToL1Input) {
    let {
      destinationChainId,
      sourceChain,
      amount,
      destinationAmountOutMin,
      bonderFee,
      recipient,
      amountOutMin,
      deadline,
      destinationDeadline,
      approval
    } = input
    deadline = deadline || this.defaultDeadlineSeconds
    destinationDeadline = destinationDeadline || 0 // must be 0
    amountOutMin = amountOutMin || '0' // must be 0
    destinationAmountOutMin = destinationAmountOutMin || '0'
    recipient = recipient || (await this.getSignerAddress())
    this.checkConnectedChain(this.signer, sourceChain)
    const ammWrapper = await this.getAmmWrapper(sourceChain, this.signer)

    if (BigNumber.from(bonderFee).gt(amount)) {
      throw new Error('amount must be greater than bonder fee')
    }

    if (approval) {
      const tx = await this.token.approve(
        sourceChain,
        ammWrapper.address,
        amount
      )
      await tx?.wait()
    } else {
      const allowance = await this.token.allowance(
        sourceChain,
        ammWrapper.address
      )
      if (allowance.lt(BigNumber.from(amount))) {
        throw new Error('not enough allowance')
      }
    }

    return ammWrapper.swapAndSend(
      destinationChainId,
      recipient,
      amount,
      bonderFee,
      amountOutMin,
      deadline,
      destinationAmountOutMin,
      destinationDeadline,
      this.txOverrides(sourceChain)
    )
  }

  private async _sendL2ToL2 (input: SendL2ToL2Input) {
    let {
      destinationChainId,
      sourceChain,
      amount,
      destinationAmountOutMin,
      bonderFee,
      deadline,
      destinationDeadline,
      amountOutMin,
      recipient,
      approval
    } = input
    deadline = deadline || this.defaultDeadlineSeconds
    destinationDeadline = destinationDeadline || deadline
    amountOutMin = amountOutMin || 0
    recipient = recipient || (await this.getSignerAddress())
    if (BigNumber.from(bonderFee).gt(amount)) {
      throw new Error('Amount must be greater than bonder fee')
    }

    this.checkConnectedChain(this.signer, sourceChain)
    const ammWrapper = await this.getAmmWrapper(sourceChain, this.signer)

    if (approval) {
      const tx = await this.token.approve(
        sourceChain,
        ammWrapper.address,
        amount
      )
      await tx?.wait()
    } else {
      const allowance = await this.token.allowance(
        sourceChain,
        ammWrapper.address
      )
      if (allowance.lt(BigNumber.from(amount))) {
        throw new Error('not enough allowance')
      }
    }

    return ammWrapper.swapAndSend(
      destinationChainId,
      recipient,
      amount,
      bonderFee,
      amountOutMin,
      deadline,
      destinationAmountOutMin || 0,
      destinationDeadline,
      this.txOverrides(sourceChain)
    )
  }

  async getBonderFee (
    amountIn: TAmount,
    sourceChain: TChain,
    destinationChain: TChain
  ) {
    sourceChain = this.toChainModel(sourceChain)
    destinationChain = this.toChainModel(destinationChain)

    if (sourceChain.isL1) {
      return BigNumber.from('0')
    }

    const hTokenAmount = await this._calcToHTokenAmount(
      amountIn.toString(),
      sourceChain
    )
    const l2Bridge = await this.getL2Bridge(sourceChain, this.signer)
    const minBonderBps = await l2Bridge?.minBonderBps()
    const minBonderFeeAbsolute = await l2Bridge?.minBonderFeeAbsolute()
    const minBonderFeeRelative = hTokenAmount.mul(minBonderBps).div(10000)
    const minBonderFee = minBonderFeeRelative.gt(minBonderFeeAbsolute)
      ? minBonderFeeRelative
      : minBonderFeeAbsolute
    return minBonderFee
  }

  async getAvailableLiquidity (destinationChain: TChain): Promise<BigNumber> {
    const chain = this.toChainModel(destinationChain)
    let bridge: ethers.Contract

    if (chain.isL1) {
      bridge = await this.getL1Bridge()
    } else {
      bridge = await this.getL2Bridge(chain)
    }

    // ToDo: Move bonder address to config
    const bonder = '0xE609c515A162D54548aFe31F4Ec3D951a99cF617'
    const credit: BigNumber = await bridge.getCredit(bonder)
    const debit: BigNumber = await bridge.getDebitAndAdditionalDebit(bonder)

    if (credit.lt(debit)) {
      return BigNumber.from('0')
    } else {
      return credit.sub(debit)
    }
  }

  async execSaddleSwap (
    sourceChain: TChain,
    toHop: boolean,
    amount: TAmount,
    minAmountOut: TAmount,
    deadline: number
  ) {
    sourceChain = this.toChainModel(sourceChain)
    const tokenSymbol = this.token.symbol
    let saddleSwap: Contract
    let tokenIndexFrom: number
    let tokenIndexTo: number

    let l2CanonicalTokenAddress =
      addresses[this.network][tokenSymbol][sourceChain.slug].l2CanonicalToken
    let l2HopBridgeTokenAddress =
      addresses[this.network][tokenSymbol][sourceChain.slug].l2HopBridgeToken
    saddleSwap = await this.getSaddleSwap(sourceChain, this.signer)
    let canonicalTokenIndex = Number(
      (await saddleSwap.getTokenIndex(l2CanonicalTokenAddress)).toString()
    )
    let hopTokenIndex = Number(
      (await saddleSwap.getTokenIndex(l2HopBridgeTokenAddress)).toString()
    )
    if (toHop) {
      tokenIndexFrom = hopTokenIndex
      tokenIndexTo = canonicalTokenIndex
    } else {
      tokenIndexFrom = canonicalTokenIndex
      tokenIndexTo = hopTokenIndex
    }

    return saddleSwap.swap(
      tokenIndexFrom,
      tokenIndexTo,
      amount,
      minAmountOut,
      deadline
    )
  }

  async getL1Bridge (signer: Signer = this.signer) {
    const tokenSymbol = this.token.symbol
    const bridgeAddress =
      addresses[this.network][tokenSymbol]['ethereum'].l1Bridge
    const provider = await this.getSignerOrProvider(Chain.Ethereum, signer)
    return new Contract(bridgeAddress, l1BridgeAbi, provider)
  }

  async getL2Bridge (chain: TChain, signer: Signer = this.signer) {
    chain = this.toChainModel(chain)
    const tokenSymbol = this.token.symbol
    const bridgeAddress =
      addresses[this.network][tokenSymbol][chain.slug].l2Bridge
    const provider = await this.getSignerOrProvider(chain, signer)
    return new Contract(bridgeAddress, l2BridgeAbi, provider)
  }

  async getAmmWrapper (chain: TChain, signer: Signer = this.signer) {
    chain = this.toChainModel(chain)
    const tokenSymbol = this.token.symbol
    const ammWrapperAddress =
      addresses[this.network][tokenSymbol][chain.slug].l2AmmWrapper
    const provider = await this.getSignerOrProvider(chain, signer)
    return new Contract(ammWrapperAddress, l2AmmWrapperAbi, provider)
  }

  async getSaddleSwap (chain: TChain, signer: Signer = this.signer) {
    chain = this.toChainModel(chain)
    const tokenSymbol = this.token.symbol
    const saddleSwapAddress =
      addresses[this.network][tokenSymbol][chain.slug].l2SaddleSwap
    const provider = await this.getSignerOrProvider(chain, signer)
    return new Contract(saddleSwapAddress, saddleSwapAbi, provider)
  }

  async getSaddleSwapReserves (chain: TChain, signer: Signer = this.signer) {
    const saddleSwap = await this.getSaddleSwap(chain, signer)
    return Promise.all([
      saddleSwap.getTokenBalance(0),
      saddleSwap.getTokenBalance(1)
    ])
  }

  private async getTokenIndexes (path: string[], chain: TChain) {
    const saddleSwap = await this.getSaddleSwap(chain)
    let tokenIndexFrom = Number(
      (await saddleSwap.getTokenIndex(path[0])).toString()
    )
    let tokenIndexTo = Number(
      (await saddleSwap.getTokenIndex(path[1])).toString()
    )

    return [tokenIndexFrom, tokenIndexTo]
  }

  async getSaddleLpToken (chain: TChain, signer: Signer = this.signer) {
    chain = this.toChainModel(chain)
    const tokenSymbol = this.token.symbol
    const saddleLpTokenAddress =
      addresses[this.network][tokenSymbol][chain.slug].l2SaddleLpToken
    const provider = await this.getSignerOrProvider(chain, signer)
    return new Contract(saddleLpTokenAddress, saddleLpTokenAbi, provider)
  }

  async getSignerOrProvider (chain: TChain, signer: Signer = this.signer) {
    chain = this.toChainModel(chain)
    if (!signer) {
      return chain.provider
    }
    const connectedChainId = await signer.getChainId()
    if (connectedChainId !== chain.chainId) {
      return chain.provider
    }
    return this.signer
  }

  async checkConnectedChain (signer: Signer, chain: Chain) {
    const connectedChainId = await signer.getChainId()
    if (connectedChainId !== chain.chainId) {
      throw new Error('invalid connected chain id')
    }
  }

  getSignerAddress () {
    if (!this.signer) {
      throw new Error('signer not connected')
    }
    return this.signer?.getAddress()
  }

  get defaultDeadlineSeconds () {
    return (Date.now() / 1000 + this.defaultDeadlineMinutes * 60) | 0
  }

  async addLiquidity (
    amount0Desired: TAmount,
    amount1Desired: TAmount,
    chain?: TChain,
    opts: any = {} // TODO
  ) {
    if (!chain) {
      chain = this.sourceChain
    }
    chain = this.toChainModel(chain)
    const amm = new AMM(this.network, this.signer, this.token, chain)
    return amm.addLiquidity(
      amount0Desired,
      amount1Desired,
      opts.minToMint,
      opts.deadline
    )
  }

  async removeLiquidity (
    liqudityTokenAmount: TAmount,
    chain?: TChain,
    opts: any = {} // TODO
  ) {
    if (!chain) {
      chain = this.sourceChain
    }
    chain = this.toChainModel(chain)
    const amm = new AMM(this.network, this.signer, this.token, chain)
    return amm.removeLiquidity(
      liqudityTokenAmount,
      opts.amount0Min,
      opts.amount1Min,
      opts.deadline
    )
  }

  txOverrides (chain: Chain) {
    const txOptions: any = {}
    if (chain.equals(Chain.Optimism)) {
      txOptions.gasPrice = 0
      txOptions.gasLimit = 8000000
    } else if (chain.equals(Chain.xDai)) {
      txOptions.gasLimit = 5000000
    }
    return txOptions
  }
}

export default HopBridge
