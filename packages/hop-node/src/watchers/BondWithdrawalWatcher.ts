import '../moduleAlias'
import BNMin from 'src/utils/BNMin'
import BaseWatcher from './classes/BaseWatcher'
import L2Bridge from './classes/L2Bridge'
import Logger from 'src/logger'
import isL1ChainId from 'src/utils/isL1ChainId'
import { BigNumber } from 'ethers'
import { BonderFeeTooLowError, NonceTooLowError } from 'src/types/error'
import { L1Bridge as L1BridgeContract } from '@hop-protocol/core/contracts/L1Bridge'
import { L1ERC20Bridge as L1ERC20BridgeContract } from '@hop-protocol/core/contracts/L1ERC20Bridge'
import { L2Bridge as L2BridgeContract } from '@hop-protocol/core/contracts/L2Bridge'
import { TxError } from 'src/constants'
import { config as globalConfig } from 'src/config'

export type Config = {
  chainSlug: string
  tokenSymbol: string
  isL1: boolean
  bridgeContract: L1BridgeContract | L1ERC20BridgeContract | L2BridgeContract
  label: string
  order?: () => number
  dryMode?: boolean
  stateUpdateAddress?: string
}

class BondWithdrawalWatcher extends BaseWatcher {
  siblingWatchers: { [chainId: string]: BondWithdrawalWatcher }

  constructor (config: Config) {
    super({
      tag: 'BondWithdrawalWatcher',
      chainSlug: config.chainSlug,
      tokenSymbol: config.tokenSymbol,
      prefix: config.label,
      logColor: 'green',
      order: config.order,
      isL1: config.isL1,
      bridgeContract: config.bridgeContract,
      dryMode: config.dryMode,
      stateUpdateAddress: config.stateUpdateAddress
    })

    const fees = globalConfig?.fees?.[this.tokenSymbol]
    this.logger.log('bonder fees:', JSON.stringify(fees))
  }

  async pollHandler () {
    if (this.isL1) {
      return
    }
    await this.checkTransferSentFromDb()
  }

  async checkTransferSentFromDb () {
    const dbTransfers = await this.db.transfers.getUnbondedSentTransfers({
      sourceChainId: await this.bridge.getChainId()
    })
    if (!dbTransfers.length) {
      return
    }

    this.logger.info(
      `checking ${dbTransfers.length} unbonded transfers db items`
    )

    const promises: Array<Promise<any>> = []
    for (const dbTransfer of dbTransfers) {
      const {
        transferId,
        destinationChainId,
        amount,
        withdrawalBondTxError
      } = dbTransfer
      const logger = this.logger.create({ id: transferId })
      const availableCredit = this.getAvailableCreditForTransfer(destinationChainId!, amount!) // eslint-disable-line @typescript-eslint/no-non-null-assertion
      if (
        availableCredit.lt(amount!) && // eslint-disable-line @typescript-eslint/no-non-null-assertion
        withdrawalBondTxError === TxError.NotEnoughLiquidity
      ) {
        logger.debug(
          `invalid credit or liquidity. availableCredit: ${availableCredit.toString()}, amount: ${amount!.toString()}`, // eslint-disable-line @typescript-eslint/no-non-null-assertion
          `withdrawalBondTxError: ${withdrawalBondTxError}`
        )

        continue
      }

      logger.debug('db poll completed')
      promises.push(this.checkTransferId(transferId!).catch(err => { // eslint-disable-line @typescript-eslint/no-non-null-assertion
        this.logger.error('checkTransferId error:', err)
      }))
    }

    await Promise.all(promises)
  }

  checkTransferId = async (transferId: string) => {
    const dbTransfer = await this.db.transfers.getByTransferId(transferId)
    if (!dbTransfer) {
      this.logger.warn(`transfer id "${transferId}" not found in db`)
      return
    }
    const {
      destinationChainId,
      sourceChainId,
      recipient,
      amount,
      amountOutMin,
      bonderFee,
      transferNonce,
      deadline,
      transferSentTxHash
    } = dbTransfer
    const logger: Logger = this.logger.create({ id: transferId })
    logger.debug('processing bondWithdrawal')
    logger.debug('amount:', amount && this.bridge.formatUnits(amount))
    logger.debug('recipient:', recipient)
    logger.debug('transferNonce:', transferNonce)
    logger.debug('bonderFee:', bonderFee && this.bridge.formatUnits(bonderFee))

    const sourceL2Bridge = this.bridge as L2Bridge
    const destBridge = this.getSiblingWatcherByChainId(destinationChainId!) // eslint-disable-line @typescript-eslint/no-non-null-assertion
      .bridge

    const isTransferSpent = await destBridge.isTransferIdSpent(transferId)
    logger.debug(`processing bondWithdrawal. isTransferSpent: ${isTransferSpent?.toString()}`)
    if (isTransferSpent) {
      logger.warn('transfer already bonded. Adding to db and skipping')
      await this.handleTransferSpentTx(transferId, destBridge)
      return
    }

    const availableCredit = this.getAvailableCreditForTransfer(destinationChainId!, amount!) // eslint-disable-line @typescript-eslint/no-non-null-assertion
    logger.debug(`processing bondWithdrawal. availableCredit: ${availableCredit.toString()}`)
    if (availableCredit.lt(amount!)) { // eslint-disable-line @typescript-eslint/no-non-null-assertion
      logger.warn(
        `not enough credit to bond withdrawal. Have ${this.bridge.formatUnits(
          availableCredit
        )}, need ${this.bridge.formatUnits(amount!)}` // eslint-disable-line @typescript-eslint/no-non-null-assertion
      )
      await this.db.transfers.update(transferId, {
        withdrawalBondTxError: TxError.NotEnoughLiquidity
      })
      return
    }

    await this.handleStateSwitch()
    if (this.isDryOrPauseMode) {
      logger.warn(`dry: ${this.dryMode}, pause: ${this.pauseMode}. skipping bondWithdrawalWatcher`)
      return
    }

    logger.debug('sending bondWithdrawal tx')

    const sourceTx = await sourceL2Bridge.getTransaction(
      transferSentTxHash! // eslint-disable-line @typescript-eslint/no-non-null-assertion
    )
    if (!sourceTx) {
      this.logger.warn(`source tx data for tx hash "${transferSentTxHash}" not found. Cannot proceed`)
      return
    }
    const { from: sender, data } = sourceTx
    const attemptSwap = this.bridge.shouldAttemptSwap(amountOutMin!, deadline!) // eslint-disable-line @typescript-eslint/no-non-null-assertion
    if (attemptSwap && isL1ChainId(destinationChainId!)) { // eslint-disable-line @typescript-eslint/no-non-null-assertion
      await this.db.transfers.update(transferId, {
        isBondable: false
      })
      return
    }

    const isBonderFeeOk = await this.getIsBonderFeeOk(transferId, attemptSwap)
    if (!isBonderFeeOk) {
      throw new BonderFeeTooLowError(`Total bonder fee is too low. Cannot bond withdrawal.`)
    }

    await this.db.transfers.update(transferId, {
      bondWithdrawalAttemptedAt: Date.now()
    })

    try {
      const tx = await this.sendBondWithdrawalTx({
        transferId,
        sender,
        recipient,
        amount,
        transferNonce,
        bonderFee,
        attemptSwap,
        destinationChainId,
        amountOutMin,
        deadline
      })

      const sentChain = attemptSwap ? `destination chain ${destinationChainId}` : 'L1'
      const msg = `sent bondWithdrawal on ${sentChain} (source chain ${sourceChainId}) tx: ${tx.hash}`
      logger.info(msg)
      this.notifier.info(msg)
    } catch (err) {
      logger.log(err.message)
      const isCallExceptionError = /The execution failed due to an exception/i.test(err.message)
      if (isCallExceptionError) {
        await this.db.transfers.update(transferId, {
          withdrawalBondTxError: TxError.CallException
        })
      }
      if (err instanceof BonderFeeTooLowError) {
        let { withdrawalBondBackoffIndex } = await this.db.transfers.getByTransferId(transferId)
        if (!withdrawalBondBackoffIndex) {
          withdrawalBondBackoffIndex = 0
        }
        withdrawalBondBackoffIndex++
        await this.db.transfers.update(transferId, {
          withdrawalBondTxError: TxError.BonderFeeTooLow,
          withdrawalBondBackoffIndex
        })
        return
      }
      if (err instanceof NonceTooLowError) {
        logger.error('nonce too low. trying again.')
        await this.db.transfers.update(transferId, {
          bondWithdrawalAttemptedAt: 0
        })
      }
      throw err
    }
  }

  sendBondWithdrawalTx = async (params: any) => {
    const {
      transferId,
      destinationChainId,
      recipient,
      amount,
      transferNonce,
      bonderFee,
      attemptSwap,
      amountOutMin,
      deadline
    } = params
    const logger = this.logger.create({ id: transferId })
    if (attemptSwap) {
      logger.debug(
        `bondWithdrawalAndAttemptSwap destinationChainId: ${destinationChainId}`
      )
      const l2Bridge = this.getSiblingWatcherByChainId(destinationChainId)
        .bridge as L2Bridge
      return await l2Bridge.bondWithdrawalAndAttemptSwap(
        recipient,
        amount,
        transferNonce,
        bonderFee,
        amountOutMin,
        deadline
      )
    } else {
      logger.debug(`bondWithdrawal chain: ${destinationChainId}`)
      const bridge = this.getSiblingWatcherByChainId(destinationChainId).bridge
      return bridge.bondWithdrawal(
        recipient,
        amount,
        transferNonce,
        bonderFee
      )
    }
  }

  async getIsBonderFeeOk (
    transferId: string,
    attemptSwap: boolean
  ): Promise<boolean> {
    const logger = this.logger.create({ id: transferId })
    const dbTransfer = await this.db.transfers.getByTransferId(transferId)
    if (!dbTransfer) {
      throw new Error('expected db transfer item')
    }

    const { amount, bonderFee, destinationChainId } = dbTransfer
    const destinationChain = this.chainIdToSlug(destinationChainId!) // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const transferSentTimestamp = dbTransfer?.transferSentTimestamp
    if (!transferSentTimestamp) {
      throw new Error('expected transferSentTimestamp')
    }

    const now = Math.floor(Date.now() / 1000)
    const nearestItemToTransferSent = await this.db.gasCost.getNearest(destinationChain, this.tokenSymbol, attemptSwap, transferSentTimestamp)
    const nearestItemToNow = await this.db.gasCost.getNearest(destinationChain, this.tokenSymbol, attemptSwap, now)
    let gasCostInToken: BigNumber
    let minBonderFeeAbsolute: BigNumber
    if (nearestItemToTransferSent && nearestItemToNow) {
      ({ gasCostInToken, minBonderFeeAbsolute } = nearestItemToTransferSent)
      const { gasCostInToken: currentGasCostInToken, minBonderFeeAbsolute: currentMinBonderFeeAbsolute } = nearestItemToNow
      gasCostInToken = BNMin(gasCostInToken, currentGasCostInToken)
      minBonderFeeAbsolute = BNMin(minBonderFeeAbsolute, currentMinBonderFeeAbsolute)
    } else if (nearestItemToNow) {
      ({ gasCostInToken, minBonderFeeAbsolute } = nearestItemToNow)
      this.logger.warn('nearestItemToTransferSent not found, using only nearestItemToNow')
    } else {
      throw new Error('expected nearestItemToTransferSent or nearestItemToNow')
    }

    logger.debug('gasCostInToken:', gasCostInToken?.toString())
    logger.debug('minBonderFeeAbsolute:', minBonderFeeAbsolute?.toString())

    const minBpsFee = await this.bridge.getBonderFeeBps(amount!, minBonderFeeAbsolute) // eslint-disable-line @typescript-eslint/no-non-null-assertion
    const minTxFee = gasCostInToken.div(2)
    const minBonderFeeTotal = minBpsFee.add(minTxFee)
    const isBonderFeeOk = bonderFee!.gte(minBonderFeeTotal) // eslint-disable-line @typescript-eslint/no-non-null-assertion
    logger.debug(`bonderFee: ${bonderFee}, minBonderFeeTotal: ${minBonderFeeTotal}, isBonderFeeOk: ${isBonderFeeOk}`)

    return isBonderFeeOk
  }

  // L2 -> L1: (credit - debit - OruToL1PendingAmount - OruToAllUnbondedTransferRoots)
  // L2 -> L2: (credit - debit)
  getAvailableCreditForTransfer (destinationChainId: number, amount: BigNumber) {
    const availableCredit = this.syncWatcher.getEffectiveAvailableCredit(destinationChainId)
    return availableCredit
  }

  async handleTransferSpentTx (transferId: string, destBridge: any): Promise<void> {
    const logger: Logger = this.logger.create({ id: transferId })
    let didFindEvent = await this.checkBondedWithdrawalEvent(transferId, destBridge)
    if (didFindEvent) {
      logger.debug('bondWithdrawal event found')
      return
    }

    didFindEvent = await this.checkWithdrewEvent(transferId, destBridge)
    if (didFindEvent) {
      logger.debug('withdrew event found')
      return
    }

    logger.warn('no transfer spent event found')
  }

  async checkBondedWithdrawalEvent (transferId: string, destBridge: any): Promise<boolean> {
    const logger: Logger = this.logger.create({ id: transferId })
    const event = await destBridge.getBondedWithdrawalEvent(transferId)
    if (event) {
      const { transactionHash } = event
      const { from: sender } = await destBridge.getTransaction(transactionHash)

      logger.debug('handling missed WithdrawalBonded event')
      logger.debug('transferId:', transferId)
      logger.debug('bonder:', sender)

      await this.db.transfers.update(transferId, {
        isBondable: true,
        withdrawalBonded: true,
        withdrawalBonder: sender,
        isTransferSpent: true,
        transferSpentTxHash: transactionHash
      })
      return true
    }
    return false
  }

  async checkWithdrewEvent (transferId: string, destBridge: any): Promise<boolean> {
    const logger: Logger = this.logger.create({ id: transferId })
    const event = await destBridge.getWithdrewEvent(transferId)
    if (event) {
      const {
        transferId,
        recipient,
        amount,
        transferNonce
      } = event.args
      const { transactionHash } = event

      logger.debug('handling missed Withdrew event')
      logger.debug('transferId:', transferId)
      logger.debug('transactionHash:', transactionHash)
      logger.debug('recipient:', recipient)
      logger.debug('amount:', amount)
      logger.debug('transferNonce:', transferNonce)

      await this.db.transfers.update(transferId, {
        isTransferSpent: true,
        transferSpentTxHash: transactionHash,
        isBondable: false
      })
      return true
    }
    return false
  }
}

export default BondWithdrawalWatcher
