import Bridge, { EventCb, EventsBatchOptions } from './Bridge'
import L1Bridge from './L1Bridge'
import L2Amm from './L2Amm'
import L2AmmWrapper from './L2AmmWrapper'
import L2BridgeWrapper from './L2BridgeWrapper'
import Token from './Token'
import erc20Abi from '@hop-protocol/core/abi/generated/ERC20.json'
import l2AmmWrapperAbi from '@hop-protocol/core/abi/generated/L2_AmmWrapper.json'
import saddleSwapAbi from '@hop-protocol/core/abi/generated/Swap.json'
import { BigNumber, Contract, providers } from 'ethers'
import { Chain } from 'src/constants'
import { ERC20, L2BridgeWrapper__factory } from '@hop-protocol/core/contracts'
import { Hop } from '@hop-protocol/sdk'
import { L2Bridge as L2BridgeContract, TransferFromL1CompletedEvent, TransferSentEvent, TransfersCommittedEvent } from '@hop-protocol/core/contracts/L2Bridge'
import { config as globalConfig } from 'src/config'

export default class L2Bridge extends Bridge {
  ammWrapper: L2AmmWrapper
  amm: L2Amm
  l2BridgeWrapper: L2BridgeWrapper
  TransfersCommitted: string = 'TransfersCommitted'
  TransferSent: string = 'TransferSent'
  TransferFromL1Completed: string = 'TransferFromL1Completed'

  constructor (private readonly l2BridgeContract: L2BridgeContract) {
    super(l2BridgeContract)

    const addresses = globalConfig.tokens[this.tokenSymbol]?.[this.chainSlug]
    if (addresses?.l2AmmWrapper) {
      const ammWrapperContract = new Contract(
        addresses.l2AmmWrapper,
        l2AmmWrapperAbi,
        this.bridgeContract.signer
      )
      this.ammWrapper = new L2AmmWrapper(ammWrapperContract)
    }

    if (addresses?.l2SaddleSwap) {
      const ammContract = new Contract(
        addresses.l2SaddleSwap,
        saddleSwapAbi,
        this.bridgeContract.signer
      )
      this.amm = new L2Amm(ammContract)
    }

    const l2BridgeWrapperContract = L2BridgeWrapper__factory.connect(this.bridgeContract.address, this.bridgeContract.signer)
    this.l2BridgeWrapper = new L2BridgeWrapper(l2BridgeWrapperContract)
  }

  getL1Bridge = async (): Promise<L1Bridge> => {
    const l1BridgeAddress = await this.l2BridgeContract.l1BridgeAddress()
    if (!l1BridgeAddress) {
      throw new Error('L1 bridge address not found')
    }
    return L1Bridge.fromAddress(l1BridgeAddress)
  }

  canonicalToken = async (): Promise<Token> => {
    const tokenAddress = await this.ammWrapper.contract.l2CanonicalToken()
    const tokenContract = new Contract(
      tokenAddress,
      erc20Abi,
      this.bridgeContract.signer
    ) as ERC20
    return new Token(tokenContract)
  }

  hToken = async (): Promise<Token> => {
    const tokenAddress = await this.l2BridgeContract.hToken()
    const tokenContract = new Contract(
      tokenAddress,
      erc20Abi,
      this.bridgeContract.signer
    ) as ERC20
    return new Token(tokenContract)
  }

  getTransferFromL1CompletedEvents = async (
    startBlockNumber: number,
    endBlockNumber: number
  ): Promise<TransferFromL1CompletedEvent[]> => {
    return await this.bridgeContract.queryFilter(
      this.l2BridgeContract.filters.TransferFromL1Completed(),
      startBlockNumber,
      endBlockNumber
    )
  }

  getTransfersCommittedEvents = async (
    startBlockNumber: number,
    endBlockNumber: number
  ): Promise<TransfersCommittedEvent[]> => {
    return await this.bridgeContract.queryFilter(
      this.l2BridgeContract.filters.TransfersCommitted(),
      startBlockNumber,
      endBlockNumber
    )
  }

  async mapTransfersCommittedEvents<R> (
    cb: EventCb<TransfersCommittedEvent, R>,
    options?: Partial<EventsBatchOptions>
  ) {
    return await this.mapEventsBatch(this.getTransfersCommittedEvents, cb, options)
  }

  async getLastTransfersCommittedEvent (): Promise<TransfersCommittedEvent | undefined> {
    let match: TransfersCommittedEvent | undefined
    await this.eventsBatch(async (start: number, end: number) => {
      const events = await this.getTransfersCommittedEvents(start, end)
      if (events.length) {
        match = events[events.length - 1]
        return false
      }
    })

    return match
  }

  getTransferSentEvents = async (
    startBlockNumber: number,
    endBlockNumber: number
  ): Promise<TransferSentEvent[]> => {
    return await this.l2BridgeContract.queryFilter(
      this.l2BridgeContract.filters.TransferSent(),
      startBlockNumber,
      endBlockNumber
    )
  }

  async mapTransferSentEvents<R> (
    cb: EventCb<TransferSentEvent, R>,
    options?: Partial<EventsBatchOptions>
  ) {
    return await this.mapEventsBatch(this.getTransferSentEvents, cb, options)
  }

  async getTransferSentEvent (transferId: string): Promise<TransferSentEvent | null> {
    let match: TransferSentEvent | undefined
    await this.eventsBatch(async (start: number, end: number) => {
      const events: any[] = await this.l2BridgeContract.queryFilter(
        this.l2BridgeContract.filters.TransferSent(transferId),
        start,
        end
      )

      for (const event of events) {
        if (event.args.transferId === transferId) {
          match = event
          return false
        }
      }
    }, { startBlockNumber: this.bridgeDeployedBlockNumber })

    if (!match) {
      return null
    }

    return match
  }

  async getTransferSentTimestamp (transferId: string): Promise<number> {
    const event = await this.getTransferSentEvent(transferId)
    if (!event) {
      return 0
    }
    return await this.getEventTimestamp(event)
  }

  sendHTokens = async (
    destinationChainId: number,
    amount: BigNumber
  ): Promise<providers.TransactionResponse> => {
    const isSupportedChainId = await this.isSupportedChainId(destinationChainId)
    if (!isSupportedChainId) {
      throw new Error(`chain ID "${destinationChainId}" is not supported`)
    }

    const sdk = new Hop(globalConfig.network)
    const bridge = sdk.bridge(this.tokenSymbol)
    const recipient = await this.getBonderAddress()
    const relayer = recipient
    const relayerFee = '0'
    const deadline = '0' // must be 0
    const amountOutMin = '0' // must be 0
    const destinationChain = this.chainIdToSlug(destinationChainId)
    const isNativeToken = this.tokenSymbol === 'MATIC' && this.chainSlug === Chain.Polygon
    const { totalFee } = await bridge.getSendData(amount, this.chainSlug, destinationChain)
    // let bonderFee = await bridge.getBonderFee(
    //   amount,
    //   this.chainSlug,
    //   destinationChain
    // )

    // bonderFee = bonderFee.add(destinationTxFee)

    if (totalFee.gt(amount)) {
      throw new Error(`amount must be greater than bonder fee. Estimated bonder fee is ${this.formatUnits(totalFee)}`)
    }

    return await this.l2BridgeContract.send(
      destinationChainId,
      recipient,
      amount,
      totalFee,
      amountOutMin,
      deadline,
      {
        ...(await this.txOverrides()),
        value: isNativeToken ? amount : undefined
      }
    )
  }

  sendCanonicalTokens = async (
    destinationChainId: number,
    amount: BigNumber
  ): Promise<providers.TransactionResponse> => {
    return await this.ammWrapper.swapAndSend(
      destinationChainId,
      amount,
      this.tokenSymbol
    )
  }

  getChainId = async (): Promise<number> => {
    if (this.chainId) {
      return this.chainId
    }
    if (!this.bridgeContract) {
      return await super.getChainId()
    }
    const chainId = Number(
      (await this.bridgeContract.getChainId()).toString()
    )
    this.chainId = chainId
    return chainId
  }

  async getChainSlug (): Promise<Chain> {
    const chainId = await this.getChainId()
    return this.chainIdToSlug(chainId)
  }

  decodeCommitTransfersData (data: string): any {
    if (!data) {
      throw new Error('data to decode is required')
    }
    const decoded = this.bridgeContract.interface.decodeFunctionData(
      'commitTransfers',
      data
    )
    const destinationChainId = Number(decoded.destinationChainId.toString())

    return {
      destinationChainId
    }
  }

  decodeSendData (data: string): any {
    if (!data) {
      throw new Error('data to decode is required')
    }
    const methodSig = data.slice(0, 10)
    const sendMethodSig = '0xa6bd1b33'
    let destinationChainId: number
    let attemptSwap = false
    if (methodSig === sendMethodSig) {
      const decoded = this.bridgeContract.interface.decodeFunctionData(
        'send',
        data
      )
      destinationChainId = Number(decoded.chainId.toString())
    } else {
      const decoded = this.ammWrapper.decodeSwapAndSendData(data)
      destinationChainId = Number(decoded.chainId.toString())
      attemptSwap = decoded.attemptSwap
    }

    return {
      destinationChainId,
      attemptSwap
    }
  }

  getPendingTransferByIndex = async (chainId: number, index: number) => {
    return await this.l2BridgeContract.pendingTransferIdsForChainId(
      chainId,
      index
    )
  }

  async doPendingTransfersExist (chainId: number): Promise<boolean> {
    try {
      await this.getPendingTransferByIndex(chainId, 0)
      return true
    } catch (err) {
      return false
    }
  }

  getLastCommitTimeForChainId = async (chainId: number): Promise<number> => {
    return Number(
      (
        await this.l2BridgeContract.lastCommitTimeForChainId(chainId)
      ).toString()
    )
  }

  getMinimumForceCommitDelay = async (): Promise<number> => {
    return Number(
      (await this.l2BridgeContract.minimumForceCommitDelay()).toString()
    )
  }

  getPendingAmountForChainId = async (chainId: number): Promise<BigNumber> => {
    const pendingAmount = await this.l2BridgeContract.pendingAmountForChainId(
      chainId
    )
    return pendingAmount
  }

  getMaxPendingTransfers = async (): Promise<number> => {
    return Number(
      (await this.l2BridgeContract.maxPendingTransfers()).toString()
    )
  }

  async getPendingTransfers (chainId: number): Promise<string[]> {
    const pendingTransfers: string[] = []
    const max = await this.getMaxPendingTransfers()
    for (let i = 0; i < max; i++) {
      try {
        const pendingTransfer = await this.getPendingTransferByIndex(chainId, i)
        pendingTransfers.push(pendingTransfer)
      } catch (err) {
        break
      }
    }

    return pendingTransfers
  }

  async getTransfersCommittedEvent (transferRootHash: string): Promise<TransfersCommittedEvent | null> {
    let match: TransfersCommittedEvent | undefined
    await this.eventsBatch(async (start: number, end: number) => {
      const events: any[] = await this.l2BridgeContract.queryFilter(
        this.l2BridgeContract.filters.TransfersCommitted(null, transferRootHash),
        start,
        end
      )

      for (const event of events) {
        if (event.args.rootHash === transferRootHash) {
          match = event
          return false
        }
      }
    }, { startBlockNumber: this.bridgeDeployedBlockNumber })

    if (!match) {
      return null
    }

    return match
  }

  async isTransferRootIdSet (
    transferRootHash: string,
    totalAmount: BigNumber
  ): Promise<boolean> {
    const transferRoot = await this.getTransferRoot(
      transferRootHash,
      totalAmount
    )
    return Number(transferRoot.createdAt.toString()) > 0
  }

  commitTransfers = async (
    destinationChainId: number
  ): Promise<providers.TransactionResponse> => {
    const tx = await this.l2BridgeContract.commitTransfers(
      destinationChainId,
      await this.txOverrides()
    )

    return tx
  }

  bondWithdrawalAndAttemptSwap = async (
    recipient: string,
    amount: BigNumber,
    transferNonce: string,
    bonderFee: BigNumber,
    amountOutMin: BigNumber,
    deadline: BigNumber
  ): Promise<providers.TransactionResponse> => {
    const txOverrides = await this.txOverrides()
    if (this.chainSlug === Chain.Polygon) {
      txOverrides.gasLimit = 1_000_000
    }

    const payload = [
      recipient,
      amount,
      transferNonce,
      bonderFee,
      amountOutMin,
      deadline,
      txOverrides
    ] as const

    const tx = await this.l2BridgeContract.bondWithdrawalAndDistribute(...payload)
    return tx
  }

  isSupportedChainId = async (chainId: number): Promise<boolean> => {
    return await this.l2BridgeContract.activeChainIds(
      chainId
    )
  }
}
