import Bridge, { EventCb, EventsBatchOptions } from './Bridge'
import Token from './Token'
import delay from 'src/decorators/delay'
import queue from 'src/decorators/queue'
import rateLimitRetry from 'src/decorators/rateLimitRetry'
import wallets from 'src/wallets'
import { BigNumber, Contract, Event, ethers, providers } from 'ethers'
import { Chain } from 'src/constants'
import { boundClass } from 'autobind-decorator'
import { erc20Abi, l1Erc20BridgeAbi } from '@hop-protocol/abi'

@boundClass
export default class L1Bridge extends Bridge {
  TransferRootBonded: string = 'TransferRootBonded'
  TransferRootConfirmed: string = 'TransferRootConfirmed'
  TransferBondChallenged: string = 'TransferBondChallenged'
  TransferSentToL2: string = 'TransferSentToL2'
  ChallengeResolved: string = 'ChallengeResolved'

  constructor (l1BridgeContract: Contract) {
    super(l1BridgeContract)
    this.l1StartListeners()
  }

  static fromAddress (address: string): L1Bridge {
    const contract = new Contract(
      address,
      l1Erc20BridgeAbi,
      wallets.get(Chain.Ethereum)
    )

    return new L1Bridge(contract)
  }

  l1StartListeners (): void {
    this.getReadBridgeContract()
      .on(
        this.getReadBridgeContract().filters.TransferRootBonded(),
        (...args: any[]) => this.emit(this.TransferRootBonded, ...args)
      )
      .on(
        this.getReadBridgeContract().filters.TransferRootConfirmed(),
        (...args: any[]) => this.emit(this.TransferRootConfirmed, ...args)
      )
      .on(
        this.getReadBridgeContract().filters.TransferBondChallenged(),
        (...args: any[]) => this.emit(this.TransferBondChallenged, ...args)
      )
      .on(
        this.getReadBridgeContract().filters.ChallengeResolved(),
        (...args: any[]) => this.emit(this.ChallengeResolved, ...args)
      )
      .on(
        this.getReadBridgeContract().filters.TransferSentToL2(),
        (...args: any[]) => this.emit(this.TransferSentToL2, ...args)
      )
      .on('error', err => {
        this.emit('error', err)
      })
  }

  @rateLimitRetry
  async decodeBondTransferRootData (data: string): Promise<any> {
    if (!data) {
      throw new Error('data to decode is required')
    }
    const decoded = await this.getReadBridgeContract().interface.decodeFunctionData(
      'bondTransferRoot',
      data
    )
    const transferRootHash = decoded.rootHash.toString()
    const destinationChainId = decoded.destinationChainId.toString()
    const totalAmount = decoded.totalAmount.toString()
    return {
      transferRootHash,
      destinationChainId,
      totalAmount
    }
  }

  @rateLimitRetry
  async decodeConfirmTransferRootData (data: string): Promise<any> {
    if (!data) {
      throw new Error('data to decode is required')
    }
    const decoded = await this.getReadBridgeContract().interface.decodeFunctionData(
      'confirmTransferRoot',
      data
    )

    return {
      originChainId: Number(decoded.originChainId.toString()),
      rootHash: decoded.rootHash,
      destinationChainId: Number(decoded.destinationChainId.toString()),
      totalAmount: decoded.totalAmount,
      rootCommittedAt: Number(decoded.rootCommittedAt.toString())
    }
  }

  @rateLimitRetry
  async getTransferBond (transferRootId: string): Promise<any> {
    return this.getReadBridgeContract().transferBonds(transferRootId)
  }

  @rateLimitRetry
  async getTransferRootBondedEvents (
    startBlockNumber: number,
    endBlockNumber: number
  ): Promise<Event[]> {
    return this.getReadBridgeContract().queryFilter(
      this.getReadBridgeContract().filters.TransferRootBonded(),
      startBlockNumber,
      endBlockNumber
    )
  }

  async mapTransferRootBondedEvents (
    cb: EventCb,
    options?: Partial<EventsBatchOptions>
  ) {
    return this.mapEventsBatch(this.getTransferRootBondedEvents, cb, options)
  }

  async getLastTransferRootBondedEvent (): Promise<any> {
    let match: Event = null
    await this.eventsBatch(async (start: number, end: number) => {
      const events = await this.getTransferRootBondedEvents(start, end)
      if (events.length) {
        match = events[events.length - 1]
        return false
      }
    })

    return match
  }

  async isTransferRootHashBonded (
    transferRootHash: string,
    amount: BigNumber
  ): Promise<boolean> {
    const transferRootId = await this.getTransferRootId(
      transferRootHash,
      amount
    )
    return this.isTransferRootIdBonded(transferRootId)
  }

  async isTransferRootIdBonded (transferRootId: string): Promise<boolean> {
    const transferBondStruct = await this.getTransferBond(transferRootId)
    if (!transferBondStruct) {
      throw new Error('transfer bond struct not found')
    }
    const createdAt = Number(transferBondStruct.createdAt?.toString())
    return createdAt > 0
  }

  @rateLimitRetry
  async getTransferRootConfirmedEvents (
    startBlockNumber: number,
    endBlockNumber: number
  ): Promise<Event[]> {
    return this.getReadBridgeContract().queryFilter(
      this.getReadBridgeContract().filters.TransferRootConfirmed(),
      startBlockNumber,
      endBlockNumber
    )
  }

  async mapTransferRootConfirmedEvents (
    cb: EventCb,
    options?: Partial<EventsBatchOptions>
  ) {
    return this.mapEventsBatch(this.getTransferRootConfirmedEvents, cb, options)
  }

  @rateLimitRetry
  async getTransferRootIdCommittedAt (transferRootId: string): Promise<number> {
    const committedAt = await this.getReadBridgeContract().transferRootCommittedAt(
      transferRootId
    )
    return Number(committedAt.toString())
  }

  async isTransferRootIdConfirmed (transferRootId: string): Promise<boolean> {
    const committedAt = await this.getTransferRootCommittedAt(transferRootId)
    return committedAt > 0
  }

  @rateLimitRetry
  async getTransferRootCommittedAt (transferRootId: string): Promise<number> {
    const committedAt = await this.getReadBridgeContract().transferRootCommittedAt(
      transferRootId
    )
    return Number(committedAt.toString())
  }

  async getMinTransferRootBondDelaySeconds (): Promise<number> {
    // MIN_TRANSFER_ROOT_BOND_DELAY
    return 15 * 60
  }

  async l1CanonicalToken (): Promise<Token> {
    const tokenAddress = await this.getReadBridgeContract().l1CanonicalToken()
    const tokenContract = new Contract(
      tokenAddress,
      erc20Abi,
      this.getWriteBridgeContract().signer
    )
    return new Token(tokenContract)
  }

  @queue
  @delay
  @rateLimitRetry
  async bondTransferRoot (
    transferRootHash: string,
    chainId: number,
    totalAmount: BigNumber
  ): Promise<providers.TransactionResponse> {
    const tx = await this.getWriteBridgeContract().bondTransferRoot(
      transferRootHash,
      chainId,
      totalAmount,
      await this.txOverrides()
    )

    return tx
  }

  @queue
  @delay
  @rateLimitRetry
  async challengeTransferRootBond (
    transferRootHash: string,
    totalAmount: BigNumber
  ): Promise<providers.TransactionResponse> {
    const tx = await this.getWriteBridgeContract().challengeTransferBond(
      transferRootHash,
      totalAmount,
      await this.txOverrides()
    )

    return tx
  }

  @queue
  @delay
  @rateLimitRetry
  async resolveChallenge (
    transferRootHash: string,
    totalAmount: BigNumber
  ): Promise<providers.TransactionResponse> {
    const tx = await this.getWriteBridgeContract().resolveChallenge(
      transferRootHash,
      totalAmount,
      await this.txOverrides()
    )

    return tx
  }

  @queue
  @delay
  @rateLimitRetry
  async convertCanonicalTokenToHopToken (
    destChainId: number,
    amount: BigNumber
  ): Promise<providers.TransactionResponse> {
    const recipient = await this.getBonderAddress()
    const relayer = ethers.constants.AddressZero
    const relayerFee = '0'
    const deadline = '0' // must be 0
    const amountOutMin = '0' // must be 0

    const isSupportedChainId = await this.isSupportedChainId(destChainId)
    if (!isSupportedChainId) {
      throw new Error(`chain ID "${destChainId}" is not supported`)
    }

    return this.getWriteBridgeContract().sendToL2(
      destChainId,
      recipient,
      amount,
      amountOutMin,
      deadline,
      relayer,
      relayerFee,
      await this.txOverrides()
    )
  }

  @rateLimitRetry
  async isSupportedChainId (chainId: number): Promise<boolean> {
    const address = await this.getReadBridgeContract().crossDomainMessengerWrappers(
      chainId
    )
    return address !== ethers.constants.AddressZero
  }
}
