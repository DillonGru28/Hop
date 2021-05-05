import { providers, Contract, ethers, BigNumber } from 'ethers'
import { erc20Abi } from '@hop-protocol/abi'
import { parseUnits } from 'ethers/lib/utils'
import Bridge from './Bridge'
import queue from './queue'
import Token from './Token'

export default class L1Bridge extends Bridge {
  l1BridgeContract: Contract
  TransferRootBonded: string = 'TransferRootBonded'
  TransferRootConfirmed: string = 'TransferRootConfirmed'
  TransferBondChallenged: string = 'TransferBondChallenged'
  ChallengeResolved: string = 'ChallengeResolved'

  constructor (l1BridgeContract: Contract) {
    super(l1BridgeContract)
    this.l1BridgeContract = l1BridgeContract
    this.l1StartListeners()
  }

  l1StartListeners (): void {
    this.l1BridgeContract
      .on(
        this.l1BridgeContract.filters.TransferRootBonded(),
        (...args: any[]) => this.emit(this.TransferRootBonded, ...args)
      )
      .on(
        this.l1BridgeContract.filters.TransferRootConfirmed(),
        (...args: any[]) => this.emit(this.TransferRootConfirmed, ...args)
      )
      .on(
        this.l1BridgeContract.filters.TransferBondChallenged(),
        (...args: any[]) => this.emit(this.TransferBondChallenged, ...args)
      )
      .on(this.l1BridgeContract.filters.ChallengeResolved(), (...args: any[]) =>
        this.emit(this.ChallengeResolved, ...args)
      )
      .on('error', err => {
        this.emit('error', err)
      })
  }

  async decodeBondTransferRootData (data: string): Promise<any> {
    const decoded = await this.l1BridgeContract.interface.decodeFunctionData(
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

  async getTransferBond (transferRootId: string): Promise<any> {
    return this.l1BridgeContract.transferBonds(transferRootId)
  }

  async getTransferRootBondedEvents (
    startBlockNumber: number,
    endBlockNumber: number
  ): Promise<any[]> {
    return this.bridgeContract.queryFilter(
      this.bridgeContract.filters.TransferRootBonded(),
      startBlockNumber,
      endBlockNumber
    )
  }

  async getTransferRootConfirmedEvents (
    startBlockNumber: number,
    endBlockNumber: number
  ): Promise<any[]> {
    return this.bridgeContract.queryFilter(
      this.bridgeContract.filters.TransferRootConfirmed(),
      startBlockNumber,
      endBlockNumber
    )
  }

  async getTransferRootCommitedAt (transferRootId: string): Promise<number> {
    const commitedAt = await this.bridgeContract.transferRootCommittedAt(
      transferRootId
    )
    return Number(commitedAt.toString())
  }

  async getMinTransferRootBondDelaySeconds (): Promise<number> {
    // MIN_TRANSFER_ROOT_BOND_DELAY
    return 15 * 60
  }

  async l1CanonicalToken (): Promise<Token> {
    const tokenAddress = await this.bridgeContract.l1CanonicalToken()
    const tokenContract = new Contract(
      tokenAddress,
      erc20Abi,
      this.bridgeContract.signer
    )
    return new Token(tokenContract)
  }

  @queue
  async bondTransferRoot (
    transferRootHash: string,
    chainId: number,
    totalAmount: BigNumber
  ): Promise<providers.TransactionResponse> {
    const [credit, debit] = await Promise.all([
      this.getCredit(),
      this.getDebit()
    ])
    if (
      credit
        .sub(debit)
        .sub(totalAmount)
        .lt(0)
    ) {
      throw new Error(
        `not enough available credit to bond transfer root. Have ${this.formatUnits(
          credit
        ) - this.formatUnits(debit)}, need ${this.formatUnits(totalAmount)}`
      )
    }

    const tx = await this.l1BridgeContract.bondTransferRoot(
      transferRootHash,
      chainId,
      totalAmount,
      await this.txOverrides()
    )

    await tx.wait()
    return tx
  }

  @queue
  async challengeTransferRootBond (
    transferRootHash: string,
    totalAmount: BigNumber
  ): Promise<providers.TransactionResponse> {
    const tx = await this.l1BridgeContract.challengeTransferBond(
      transferRootHash,
      totalAmount,
      await this.txOverrides()
    )

    await tx.wait()
    return tx
  }

  @queue
  async resolveChallenge (
    transferRootHash: string,
    totalAmount: BigNumber
  ): Promise<providers.TransactionResponse> {
    const tx = await this.l1BridgeContract.resolveChallenge(
      transferRootHash,
      totalAmount,
      await this.txOverrides()
    )

    await tx.wait()
    return tx
  }

  @queue
  async convertCanonicalTokenToHopToken (
    destChainId: number,
    amount: BigNumber
  ): Promise<providers.TransactionResponse> {
    const recipient = await this.getBonderAddress()
    const deadline = '0'
    const relayer = ethers.constants.AddressZero
    const relayerFee = '0'
    const amountOutMin = '0'

    const isSupportedChainId = await this.isSupportedChainId(destChainId)
    if (!isSupportedChainId) {
      throw new Error(`chain ID "${destChainId}" is not supported`)
    }

    return this.l1BridgeContract.sendToL2(
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

  async isSupportedChainId (chainId: number): Promise<boolean> {
    const address = await this.l1BridgeContract.crossDomainMessengerWrappers(
      chainId
    )
    return address !== ethers.constants.AddressZero
  }
}
