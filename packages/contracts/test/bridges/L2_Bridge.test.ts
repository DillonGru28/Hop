import '@nomiclabs/hardhat-waffle'
import { expect } from 'chai'
import { Signer, Contract, BigNumber } from 'ethers'
import { fixture } from '../shared/fixtures'
import Transfer from '../../lib/Transfer'
import {
  setUpDefaults,
  expectBalanceOf,
  sendTokensAcrossHopBridge
} from '../shared/utils'
import {
  CHAIN_IDS,
  IFixture,
  ONE_ADDRESS,
  USER_INITIAL_BALANCE,
  TRANSFER_AMOUNT
} from '../shared/constants'

/**
 * Note: This test uses an implementation of the L2 bridge but only tests the
 *       abstract L2_Bridge.sol.
 */ 

describe("L2_Bridge", () => {
  let _fixture: IFixture
  let l2ChainId: BigNumber

  let user: Signer
  let bonder: Signer
  let governance: Signer
  let otherAccount: Signer

  let l1_canonicalToken: Contract
  let l1_bridge: Contract
  let l2_canonicalToken: Contract
  let l2_bridge: Contract
  let l2_messenger: Contract

  let transfers: Transfer[]

  let sendTokenInitialBalance: BigNumber

  beforeEach(async () => {
    l2ChainId = CHAIN_IDS.OPTIMISM_TESTNET_1
    _fixture = await fixture(l2ChainId)
    await setUpDefaults(_fixture, l2ChainId)

    ;({ 
      user,
      bonder,
      governance,
      otherAccount,
      l1_canonicalToken,
      l1_bridge,
      l2_canonicalToken,
      l2_bridge,
      l2_messenger,
      transfers
    } = _fixture);

    sendTokenInitialBalance = USER_INITIAL_BALANCE.div(2)
  })

  /**
   * Happy Path
   */

  it('Should set the correct values in the constructor', async () => {
    const expectedL1GovernanceAddress = await governance.getAddress()
    const expectedL2CanonicalTokenAddress = l2_canonicalToken.address
    const expectedL1BridgeAddress = l1_bridge.address
    const expectedBonderAddress = await bonder.getAddress()

    const l1GovernanceAddress = await l2_bridge.l1Governance()
    const l2CanonicalTokenAddress = await l2_bridge.l2CanonicalToken()
    const l1BridgeAddress = await l2_bridge.l1BridgeAddress()
    const isChainIdSupported = await l2_bridge.supportedChainIds(CHAIN_IDS.MAINNET)
    const bonderAddress = await l2_bridge.getBonder()

    expect(expectedL1GovernanceAddress).to.eq(l1GovernanceAddress)
    expect(expectedL2CanonicalTokenAddress).to.eq(l2CanonicalTokenAddress)
    expect(expectedL1BridgeAddress).to.eq(l1BridgeAddress)
    expect(true).to.eq(isChainIdSupported)
    expect(expectedBonderAddress).to.eq(bonderAddress)
  })

  it('Should set the exchange address arbitrarily', async () => {
    const expectedExchangeAddress = ONE_ADDRESS

    await l2_bridge.connect(governance).setExchangeAddress(expectedExchangeAddress)
    const exchangeAddress = await l2_bridge.exchangeAddress()
    expect(exchangeAddress).to.eq(expectedExchangeAddress)
  })

  it('Should set the L1 bridge address arbitrarily', async () => {
    const expectedL1BridgeAddress = ONE_ADDRESS

    await l2_bridge.connect(governance).setL1BridgeAddress(expectedL1BridgeAddress)
    const l1BridgeAddress = await l2_bridge.l1BridgeAddress()
    expect(l1BridgeAddress).to.eq(expectedL1BridgeAddress)
  })

  it('Should add support for a new chainId', async () => {
    const newChainId = CHAIN_IDS.KOVAN

    let isChainIdSupported = await l2_bridge.supportedChainIds(newChainId)
    expect(isChainIdSupported).to.eq(false)

    await l2_bridge.connect(governance).addSupportedChainId(newChainId)

    isChainIdSupported = await l2_bridge.supportedChainIds(newChainId)
    expect(isChainIdSupported).to.eq(true)
  })

  it('Should add support for a new chainId then remove it', async () => {
    const newChainId = CHAIN_IDS.KOVAN

    let isChainIdSupported = await l2_bridge.supportedChainIds(newChainId)
    expect(isChainIdSupported).to.eq(false)

    await l2_bridge.connect(governance).addSupportedChainId(newChainId)

    isChainIdSupported = await l2_bridge.supportedChainIds(newChainId)
    expect(isChainIdSupported).to.eq(true)

    await l2_bridge.connect(governance).removeSupportedChainId(newChainId)

    isChainIdSupported = await l2_bridge.supportedChainIds(newChainId)
    expect(isChainIdSupported).to.eq(false)
  })

  it.only('Should send tokens across the bridge via sendToL2', async () => {
    const transfer = transfers[0]

    // Add hToken to the users' address on L2
    await sendTokensAcrossHopBridge(
      l1_canonicalToken,
      l1_bridge,
      l2_bridge,
      l2_messenger,
      user,
      sendTokenInitialBalance,
      l2ChainId
    )

    // Execute transaction
    await l2_bridge.connect(governance).addSupportedChainId(transfer.chainId)
    await l2_bridge.connect(user).approve(l2_bridge.address, sendTokenInitialBalance)
    await l2_bridge.connect(user).send(
      transfer.chainId,
      transfer.recipient,
      transfer.amount,
      transfer.transferNonce,
      transfer.relayerFee,
      transfer.amountOutMin,
      transfer.deadline
    )

    // Verify state
    const expectedCurrentBridgeBal = sendTokenInitialBalance.sub(TRANSFER_AMOUNT)
    await expectBalanceOf(l2_bridge, user, expectedCurrentBridgeBal)

    const pendingTransferHash = await l2_bridge.pendingTransfers(0)
    const expectedPendingTransferHash: Buffer = transfer.getTransferHash()
    expect(pendingTransferHash).to.eq('0x' + expectedPendingTransferHash.toString('hex'))

    const pendingAmountChainId = await l2_bridge.pendingAmountChainIds(0)
    const expectedPendingAmountChainId = transfer.chainId
    expect(pendingAmountChainId).to.eq(expectedPendingAmountChainId)

    const pendingAmount = await l2_bridge.pendingAmountForChainId(transfer.chainId)
    const expectedPendingAmount = transfer.amount
    expect(pendingAmount).to.eq(expectedPendingAmount)

    const transfersSentEvent = (await l2_bridge.queryFilter(l2_bridge.filters.TransferSent()))[0]
    const transferSentArgs = transfersSentEvent.args
    expect(transferSentArgs[0]).to.eq('0x' + expectedPendingTransferHash.toString('hex'))
    expect(transferSentArgs[1]).to.eq(transfer.recipient)
    expect(transferSentArgs[2]).to.eq(TRANSFER_AMOUNT)
    expect(transferSentArgs[3]).to.eq(transfer.transferNonce)
    expect(transferSentArgs[4]).to.eq(transfer.relayerFee)
  })

  // TODO: Over 100 pending transfers in send()

  /**
   * Non-Happy Path
   */

   // TODO: only governance
   // TODO: all requires


})