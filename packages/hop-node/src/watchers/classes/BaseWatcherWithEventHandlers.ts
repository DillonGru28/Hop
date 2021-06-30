import { Contract, BigNumber, Event } from 'ethers'
import BaseWatcher from './BaseWatcher'
import db from 'src/db'
import L2Bridge from './L2Bridge'
import chalk from 'chalk'

interface Config {
  tag: string
  prefix?: string
  logColor?: string
  order?: () => number
  isL1?: boolean
  bridgeContract?: Contract
  dryMode?: boolean
}

class BaseWatcherWithEventHandlers extends BaseWatcher {
  constructor (config: Config) {
    super(config)
  }

  public handleTransferSentEvent = async (
    transferId: string,
    destinationChainIdBn: BigNumber,
    recipient: string,
    amount: BigNumber,
    transferNonce: string,
    bonderFee: BigNumber,
    index: string,
    amountOutMin: BigNumber,
    deadline: BigNumber,
    event: Event
  ) => {
    const logger = this.logger.create({ id: transferId })
    logger.debug(`handling TransferSent event`)

    try {
      const { transactionHash } = event
      const blockNumber: number = (event as any).blockNumber
      if (!transactionHash) {
        throw new Error('event transaction hash not found')
      }
      if (!blockNumber) {
        throw new Error('event block number not found')
      }
      const sentTimestamp = await this.bridge.getBlockTimestamp(blockNumber)
      const l2Bridge = this.bridge as L2Bridge
      const destinationChainId = Number(destinationChainIdBn.toString())
      const sourceChainId = await l2Bridge.getChainId()

      logger.debug('transfer event amount:', this.bridge.formatUnits(amount))
      logger.debug('destinationChainId:', destinationChainId)
      logger.debug('transferId:', chalk.bgCyan.black(transferId))

      await db.transfers.update(transferId, {
        transferId,
        destinationChainId,
        sourceChainId,
        recipient,
        amount,
        transferNonce,
        bonderFee,
        amountOutMin,
        deadline: Number(deadline.toString()),
        transferSentTxHash: transactionHash,
        transferSentBlockNumber: blockNumber,
        transferSentTimestamp: sentTimestamp
      })
    } catch (err) {
      logger.error(`handleTransferSentEvent error: ${err.message}`)
      this.notifier.error(`handleTransferSentEvent error: ${err.message}`)
    }
  }

  handleTransferRootConfirmedEvent = async (
    sourceChainId: BigNumber,
    destChainId: BigNumber,
    transferRootHash: string,
    totalAmount: BigNumber,
    event: Event
  ) => {
    const logger = this.logger.create({ root: transferRootHash })
    logger.debug('handling TransferRootConfirmed event')

    try {
      const { transactionHash } = event
      const dbTransferRoot = await db.transferRoots.getByTransferRootHash(
        transferRootHash
      )
      await db.transferRoots.update(transferRootHash, {
        confirmed: true,
        confirmTxHash: transactionHash
      })
    } catch (err) {
      logger.error(`handleTransferRootConfirmedEvent error: ${err.message}`)
      this.notifier.error(
        `handleTransferRootConfirmedEvent error: ${err.message}`
      )
    }
  }

  handleTransferRootBondedEvent = async (
    transferRootHash: string,
    totalAmount: BigNumber,
    event: Event
  ) => {
    const logger = this.logger.create({ root: transferRootHash })
    logger.debug('handling TransferRootBonded event')

    try {
      const { transactionHash } = event
      const tx = await event.getTransaction()
      const { from: bonder } = tx
      const transferRootId = await this.bridge.getTransferRootId(
        transferRootHash,
        totalAmount
      )

      logger.debug(`transferRootHash from event: ${transferRootHash}`)
      logger.debug(`bondAmount: ${this.bridge.formatUnits(totalAmount)}`)
      logger.debug(`transferRootId: ${transferRootId}`)
      logger.debug(`event transactionHash: ${transactionHash}`)
      logger.debug(`bonder: ${bonder}`)

      await db.transferRoots.update(transferRootHash, {
        transferRootHash,
        transferRootId,
        committed: true,
        bonded: true,
        bonder,
        bondTxHash: transactionHash
      })
    } catch (err) {
      logger.error(`handleTransferRootBondedEvent error: ${err.message}`)
      this.notifier.error(`handleTransferRootBondedEvent error: ${err.message}`)
    }
  }

  handleTransfersCommittedEvent = async (
    destinationChainIdBn: BigNumber,
    transferRootHash: string,
    totalAmount: BigNumber,
    committedAtBn: BigNumber,
    event: Event
  ) => {
    const logger = this.logger.create({ root: transferRootHash })
    logger.debug('handling TransfersCommitted event')

    try {
      const committedAt = Number(committedAtBn.toString())
      const { transactionHash } = event
      const l2Bridge = this.bridge as L2Bridge

      const sourceChainId = await l2Bridge.getChainId()
      const destinationChainId = Number(destinationChainIdBn.toString())
      let destinationBridgeAddress: string
      const isExitWatcher = !this.hasSiblingWatcher(destinationChainId)
      if (!isExitWatcher) {
        destinationBridgeAddress = await this.getSiblingWatcherByChainId(
          destinationChainId
        ).bridge.getAddress()
      }
      const transferRootId = await this.bridge.getTransferRootId(
        transferRootHash,
        totalAmount
      )

      logger.debug(`committedAt:`, committedAt)
      logger.debug(`totalAmount:`, this.bridge.formatUnits(totalAmount))
      logger.debug(`transferRootHash:`, transferRootHash)
      logger.debug(`destinationChainId:`, destinationChainId)

      await db.transferRoots.update(transferRootHash, {
        transferRootHash,
        transferRootId,
        totalAmount,
        committedAt,
        destinationChainId,
        destinationBridgeAddress,
        sourceChainId,
        committed: true,
        commitTxHash: transactionHash
      })
    } catch (err) {
      logger.error(`handleTransfersCommittedEvent error: ${err.message}`)
      this.notifier.error(`handleTransfersCommittedEvent error: ${err.message}`)
    }
  }
}

export default BaseWatcherWithEventHandlers
