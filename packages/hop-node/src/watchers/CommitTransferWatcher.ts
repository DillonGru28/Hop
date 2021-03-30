import '../moduleAlias'
import { Contract } from 'ethers'
import chalk from 'chalk'
import { wait } from 'src/utils'
import { throttle } from 'src/utils'
import db from 'src/db'
import MerkleTree from 'src/utils/MerkleTree'
import BaseWatcher from './helpers/BaseWatcher'
import L2Bridge from './helpers/L2Bridge'

export interface Config {
  l2BridgeContract: Contract
  contracts: { [networkId: string]: Contract }
  label: string
  order?: () => number
}

class CommitTransfersWatcher extends BaseWatcher {
  l2Bridge: L2Bridge
  contracts: { [networkId: string]: Contract }

  constructor (config: Config) {
    super({
      tag: 'commitTransferWatcher',
      prefix: config.label,
      logColor: 'yellow',
      order: config.order
    })
    this.l2Bridge = new L2Bridge(config.l2BridgeContract)
    this.contracts = config.contracts
  }

  async start () {
    this.started = true
    this.logger.debug(`starting L2 commitTransfers scheduler`)
    try {
      await Promise.all([this.syncUp(), this.watch()])
    } catch (err) {
      this.logger.error('watcher error:', err)
    }
  }

  async stop () {
    this.l2Bridge.removeAllListeners()
    this.started = false
    this.logger.setEnabled(false)
  }

  async syncUp () {
    this.logger.debug('syncing up events')
    const blockNumber = await this.l2Bridge.getBlockNumber()
    const startBlockNumber = blockNumber - 1000
    const transferSentEvents = await this.l2Bridge.getTransferSentEvents(
      startBlockNumber,
      blockNumber
    )

    for (let event of transferSentEvents) {
      const {
        transferId,
        recipient,
        amount,
        transferNonce,
        bonderFee,
        index
      } = event.args
      await this.handleTransferSentEvent(
        transferId,
        recipient,
        amount,
        transferNonce,
        bonderFee,
        index,
        event
      )
    }
  }

  async watch () {
    this.l2Bridge
      .on(this.l2Bridge.TransferSent, this.handleTransferSentEvent)
      .on('error', err => {
        this.logger.error('event watcher error:', err.message)
      })

    while (true) {
      if (!this.started) return
      try {
        const chainIds = Object.keys(this.contracts)
        for (let chainId of chainIds) {
          //await this.getRecentTransferHashesForCommittedRoots()
          const pendingTransfers = await this.l2Bridge.getPendingTransfers(
            chainId
          )
          if (pendingTransfers.length > 0) {
            await this.checkTransferSent(chainId)
          }
        }
      } catch (err) {
        this.logger.error('error checking:', err.message)
      }
      await wait(10 * 1000)
    }
  }

  checkTransferSent = throttle(async (chainId: string) => {
    if (!chainId) {
      throw new Error('chainId is required')
    }
    const pendingAmount = await this.l2Bridge.getPendingAmountForChainId(
      chainId
    )
    if (pendingAmount <= 0) {
      return
    }

    const lastCommitTime = await this.l2Bridge.getLastCommitTimeForChainId(
      chainId
    )
    const minimumForceCommitDelay = await this.l2Bridge.getMinimumForceCommitDelay()
    const minForceCommitTime = lastCommitTime + minimumForceCommitDelay
    const isBonder = await this.l2Bridge.isBonder()
    const l2ChainId = await this.l2Bridge.getChainId()
    this.logger.debug('chainId:', l2ChainId)
    this.logger.debug('destinationChainId:', chainId)
    this.logger.debug('lastCommitTime:', lastCommitTime)
    this.logger.debug('minimumForceCommitDelay:', minimumForceCommitDelay)
    this.logger.debug('minForceCommitTime:', minForceCommitTime)
    this.logger.debug('isBonder:', isBonder)

    if (minForceCommitTime >= Date.now() && !isBonder) {
      this.logger.warn('only Bonder can commit before min delay')
    }

    const messengerAddress = await this.l2Bridge.l2BridgeWrapper.getMessengerAddress()
    this.logger.debug('messenger address:', messengerAddress)

    const pendingTransfers: string[] = await this.l2Bridge.getPendingTransfers(
      chainId
    )
    if (!pendingTransfers.length) {
      this.logger.warn('no pending transfers to commit')
    }

    this.logger.debug(chainId, 'onchain pendingTransfers', pendingTransfers)
    const tree = new MerkleTree(pendingTransfers)
    const transferRootHash = tree.getHexRoot()
    this.logger.debug(
      chainId,
      'calculated transferRootHash:',
      chalk.bgMagenta.black(transferRootHash)
    )
    await db.transferRoots.update(transferRootHash, {
      transferRootHash,
      transferHashes: pendingTransfers
    })

    const dbTransferRoot = await db.transferRoots.getByTransferRootHash(
      transferRootHash
    )
    if (dbTransferRoot?.sentCommitTx || dbTransferRoot?.commited) {
      this.logger.debug(
        'sent?:',
        !!dbTransferRoot.sentCommitTx,
        'commited?:',
        !!dbTransferRoot.commited
      )
      return
    }

    await db.transferRoots.update(transferRootHash, {
      sentCommitTx: true
    })

    const tx = await this.l2Bridge.commitTransfers(chainId)
    tx?.wait()
      .then(async (receipt: any) => {
        if (receipt.status !== 1) {
          await db.transferRoots.update(transferRootHash, {
            sentCommitTx: false
          })
          throw new Error('status=0')
        }
        this.emit('commitTransfers', {
          chainId,
          transferRootHash,
          transferHashes: pendingTransfers
        })
        await db.transferRoots.update(transferRootHash, {
          commited: true
        })
      })
      .catch(async (err: Error) => {
        await db.transferRoots.update(transferRootHash, {
          sentCommitTx: false
        })

        throw err
      })
    this.logger.info(
      `L2 commitTransfers tx:`,
      chalk.bgYellow.black.bold(tx.hash)
    )
  }, 15 * 1000)

  handleTransferSentEvent = async (
    transferHash: string,
    recipient: string,
    amount: string,
    transferNonce: string,
    bonderFee: string,
    index: string,
    meta: any
  ) => {
    try {
      const dbTransferHash = await db.transfers.getByTransferHash(transferHash)
      if (dbTransferHash?.sourceChainId) {
        return
      }

      this.logger.debug(`received TransferSent event`)
      this.logger.debug(`waiting`)
      // TODO: batch
      const { transactionHash } = meta
      const { data } = await this.l2Bridge.getTransaction(transactionHash)

      const { chainId } = await this.l2Bridge.decodeSendData(data)
      const sourceChainId = await this.l2Bridge.getChainId()
      await db.transfers.update(transferHash, {
        transferHash,
        chainId,
        sourceChainId
      })
    } catch (err) {
      if (err.message !== 'cancelled') {
        this.logger.error('commitTransfers tx error:', err.message)
      }
    }
  }

  async getRecentTransferHashesForCommittedRoots () {
    const blockNumber = await this.l2Bridge.getBlockNumber()
    let start = blockNumber - 1000
    const transferCommits = await this.l2Bridge.getTransfersCommitedEvents(
      start,
      blockNumber
    )
    if (!transferCommits.length) {
      return
    }
    const transferCommitsMap: any = {}
    for (let i = 1; i < transferCommits.length; i++) {
      let { topics, blockNumber, transactionHash } = transferCommits[i]
      const { data } = await this.l2Bridge.getTransaction(transactionHash)
      const {
        destinationChainId: chainId
      } = await this.l2Bridge.decodeCommitTransfersData(data)
      if (!chainId) {
        continue
      }
      const transferRootHash = topics[1]
      const prevBlockNumber =
        i === 0 ? start : transferCommits[i - 1].blockNumber
      if (!transferCommitsMap[chainId]) {
        transferCommitsMap[chainId] = {}
      }
      transferCommitsMap[chainId][transferRootHash] = {
        transferRootHash,
        transferHashes: [],
        prevBlockNumber,
        blockNumber
      }
    }
    for (let destChainId in transferCommitsMap) {
      for (let transferRootHash in transferCommitsMap[destChainId]) {
        let {
          prevBlockNumber,
          blockNumber,
          transferHashes
        } = transferCommitsMap[destChainId][transferRootHash]
        const recentEvents = await this.l2Bridge.getTransferSentEvents(
          prevBlockNumber,
          blockNumber
        )
        for (let event of recentEvents) {
          const { data } = await this.l2Bridge.getTransaction(
            event.transactionHash
          )

          const { chainId } = await this.l2Bridge.decodeSendData(data)
          if (chainId === destChainId) {
            transferHashes.push(event.topics[1])
          }
        }
        if (transferHashes.length) {
          const tree = new MerkleTree(transferHashes)
          if (tree.getHexRoot() === transferRootHash) {
            db.transferRoots.update(transferRootHash, {
              transferHashes: transferHashes,
              commited: true
            })
          } else {
            this.logger.warn(
              'merkle hex root does not match commited transfer root'
            )
          }
        }
      }
    }
  }
}

export default CommitTransfersWatcher
