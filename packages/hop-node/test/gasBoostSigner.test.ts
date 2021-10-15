import GasBoostSigner from 'src/gasboost/GasBoostSigner'
import GasBoostTransaction from 'src/gasboost/GasBoostTransaction'
import MemoryStore from 'src/gasboost/MemoryStore'
import getRpcProvider from 'src/utils/getRpcProvider'
import wait from 'src/utils/wait'
import { Wallet } from 'ethers'
import { privateKey } from './config'

describe('GasBoostSigner', () => {
  it('initialize', async () => {
    const provider = getRpcProvider('xdai')
    const store = new MemoryStore()
    const signer = new GasBoostSigner(privateKey, provider)
    signer.setStore(store)
    expect(await signer.getAddress()).toBeTruthy()
  })
  it.skip('sendTransaction - xdai', async () => {
    const provider = getRpcProvider('xdai')
    const store = new MemoryStore()
    const signer = new GasBoostSigner(privateKey, provider, store, {
      timeTilBoostMs: 10 * 1000
      // compareMarketGasPrice: false
    })
    const recipient = await signer.getAddress()
    console.log('recipient:', recipient)
    const tx = await signer.sendTransaction({
      to: recipient,
      value: '0',
      gasPrice: '1'
    })
    expect(tx.hash).toBeTruthy()
    let confirmed = false
    ;(tx as GasBoostTransaction).on('confirmed', (tx: any) => {
      confirmed = true
    })
    let boosted = false
    ;(tx as GasBoostTransaction).on('boosted', (boostedTx: any, boostIndex: number) => {
      console.log('boosted', {
        hash: boostedTx.hash,
        gasPrice: tx.gasPrice?.toString(),
        boostIndex
      })
      boosted = true
      expect(boostedTx).toBeTruthy()
    })
    await tx.wait()
    await wait(1 * 1000)
    expect(confirmed).toBeTruthy()
    expect(boosted).toBeTruthy()
  }, 10 * 60 * 1000)
  it.skip('sendTransaction - kovan', async () => {
    const provider = getRpcProvider('ethereum')
    const store = new MemoryStore()
    const signer = new GasBoostSigner(privateKey, provider, store, {
      timeTilBoostMs: 10 * 1000
      // compareMarketGasPrice: false
    })
    const recipient = await signer.getAddress()
    console.log('recipient:', recipient)
    const tx = await signer.sendTransaction({
      to: recipient,
      value: '0',
      maxPriorityFeePerGas: '1'
    })
    expect(tx.hash).toBeTruthy()
    let confirmed = false
    ;(tx as GasBoostTransaction).on('confirmed', (tx: any) => {
      confirmed = true
    })
    let boosted = false
    ;(tx as GasBoostTransaction).on('boosted', (boostedTx: any, boostIndex: number) => {
      console.log('boosted', {
        hash: boostedTx.hash,
        gasPrice: tx.gasPrice?.toString(),
        maxFeePerGas: tx.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString(),
        boostIndex
      })
      boosted = true
      expect(boostedTx).toBeTruthy()
    })
    await tx.wait()
    await wait(1 * 1000)
    expect(confirmed).toBeTruthy()
    expect(boosted).toBeTruthy()
  }, 10 * 60 * 1000)
  it.skip('maxGasBoostReached', async () => {
    const provider = getRpcProvider('xdai')
    const store = new MemoryStore()
    const signer = new GasBoostSigner(privateKey, provider, store, {
      timeTilBoostMs: 5 * 1000,
      compareMarketGasPrice: false,
      maxGasPriceGwei: 0.22,
      gasPriceMultiplier: 1.5
    })
    const recipient = await signer.getAddress()
    console.log('recipient:', recipient)
    const tx = await signer.sendTransaction({
      to: recipient,
      value: '0',
      gasPrice: '100000000' // 0.1 gwei
    })
    expect(tx.hash).toBeTruthy()
    let boostedIndex = 0
    ;(tx as GasBoostTransaction).on('boosted', (boostedTx: any, boostIndex: number) => {
      console.log('boosted', {
        hash: boostedTx.hash,
        gasPrice: tx.gasPrice?.toString(),
        boostIndex
      })
      boostedIndex = boostIndex
    })
    let maxGasPriceReached = false
    ;(tx as GasBoostTransaction).on('maxGasPriceReached', (gasPrice: any, boostIndex: number) => {
      console.log('maxGasPriceReached', {
        gasPrice: gasPrice.toString(),
        boostIndex
      })
      maxGasPriceReached = true
    })
    await wait(30 * 1000)
    expect(maxGasPriceReached).toBeTruthy()
    expect(boostedIndex).toBe(1)
  }, 10 * 60 * 1000)
  it('nonceTooLow', async () => {
    const provider = getRpcProvider('xdai')
    const store = new MemoryStore()
    const signer = new GasBoostSigner(privateKey, provider, store, {
      timeTilBoostMs: 5 * 1000
    })
    const recipient = await signer.getAddress()
    console.log('recipient:', recipient)
    expect(signer.nonce).toBe(0)
    let errMsg = ''
    const nonce = await signer.getTransactionCount('pending')
    try {
      const tx = await signer.sendTransaction({
        to: recipient,
        value: '0',
        gasPrice: '100000000', // 0.1 gwei
        nonce: nonce - 1
      })
    } catch (err) {
      errMsg = err.message
    }
    expect(errMsg).toBe('NonceTooLow')
    expect(signer.nonce).toBe(nonce + 1)
  }, 10 * 60 * 1000)
})

describe('GasBoostTransaction', () => {
  const store = new MemoryStore()
  const provider = getRpcProvider('xdai')
  const signer = new Wallet(privateKey, provider)

  it('instance', () => {
    const gTx = new GasBoostTransaction({
      to: '0x81682250D4566B2986A2B33e23e7c52D401B7aB7',
      value: '1'
    }, signer, store)

    expect(gTx.id).toBeTruthy()
  })
})
