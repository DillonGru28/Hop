import BaseWatcher from './classes/BaseWatcher'
import Logger from 'src/logger'
import wallets from 'src/wallets'
import { Chain } from 'src/constants'
import { L1Bridge as L1BridgeContract } from '@hop-protocol/core/contracts/L1Bridge'
import { L1TransactionReceipt, L2TransactionReceipt, getL2Network } from '@arbitrum/sdk'
import { L2Bridge as L2BridgeContract } from '@hop-protocol/core/contracts/L2Bridge'
import { Wallet, providers } from 'ethers'

type Config = {
  chainSlug: string
  tokenSymbol: string
  bridgeContract?: L1BridgeContract | L2BridgeContract
  dryMode?: boolean
}

const l1ToL2TxStatuses: Record<number, string> = {
  1: 'Not yet created',
  2: 'Creation failed',
  3: 'Funds deposited on L2. They to be manually redeemed.',
  4: 'Redeemed',
  5: 'Expired'
}

class ArbitrumBridgeWatcher extends BaseWatcher {
  l1Wallet: Wallet
  l2Wallet: Wallet
  ready: boolean

  constructor (config: Config) {
    super({
      chainSlug: config.chainSlug,
      tokenSymbol: config.tokenSymbol,
      logColor: 'yellow',
      bridgeContract: config.bridgeContract,
      dryMode: config.dryMode
    })

    this.l1Wallet = wallets.get(Chain.Ethereum)
    this.l2Wallet = wallets.get(Chain.Arbitrum)
  }

  async relayXDomainMessage (
    txHash: string
  ): Promise<providers.TransactionResponse> {
    const txReceipt = await this.l2Wallet.provider.getTransactionReceipt(txHash)
    const initiatingTxnReceipt = new L2TransactionReceipt(
      txReceipt
    )

    if (!initiatingTxnReceipt) {
      throw new Error(
        `no arbitrum transaction found for tx hash ${txHash}`
      )
    }

    const l2Network = await getL2Network(this.l2Wallet.provider)
    const outGoingMessagesFromTxn = await initiatingTxnReceipt.getL2ToL1Messages(this.l1Wallet, l2Network)
    if (outGoingMessagesFromTxn.length === 0) {
      throw new Error(`tx hash ${txHash} did not initiate an outgoing messages`)
    }

    const msg = outGoingMessagesFromTxn[0]
    const proofInfo = await msg.tryGetProof(this.l2Wallet.provider)
    if (!proofInfo) {
      throw new Error(`proof not found for tx hash ${txHash}`)
    }

    return msg.execute(proofInfo)
  }

  async handleCommitTxHash (commitTxHash: string, transferRootId: string, logger: Logger) {
    logger.debug(
      `attempting to send relay message on arbitrum for commit tx hash ${commitTxHash}`
    )
    if (this.dryMode) {
      this.logger.warn(`dry: ${this.dryMode}, skipping relayXDomainMessage`)
      return
    }

    await this.db.transferRoots.update(transferRootId, {
      sentConfirmTxAt: Date.now()
    })
    const tx = await this.relayXDomainMessage(commitTxHash)
    if (!tx) {
      logger.warn(`No tx exists for exit, commitTxHash ${commitTxHash}`)
      return
    }

    const msg = `sent chain ${this.bridge.chainId} confirmTransferRoot exit tx ${tx.hash}`
    logger.info(msg)
    this.notifier.info(msg)
  }

  async redeemArbitrumTransaction (l1TxHash: string) {
    const txReceipt = await this.l1Wallet.provider.getTransactionReceipt(l1TxHash)
    const l1TxnReceipt = new L1TransactionReceipt(txReceipt)
    const l1ToL2Message = await l1TxnReceipt.getL1ToL2Message(this.l2Wallet)
    const res = await l1ToL2Message.waitForStatus()
    if (res?.status !== 3) {
      this.logger.error(`Transaction not redeemable. Status: ${l1ToL2TxStatuses[res.status]}`)
      throw new Error('Transaction unredeemable')
    }
    await l1ToL2Message.redeem()
  }
}

export default ArbitrumBridgeWatcher
