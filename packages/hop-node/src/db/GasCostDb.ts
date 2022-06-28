import BaseDb, { BaseItem, KeyFilter } from './BaseDb'
import nearest from 'nearest-date'
import wait from 'src/utils/wait'
import { BigNumber } from 'ethers'
import { OneHourMs, OneHourSeconds, OneWeekMs } from 'src/constants'
import { normalizeDbItem } from './utils'

const varianceSeconds = 20 * 60

type GasCost = BaseItem & {
  id?: string
  chain: string
  token: string
  timestamp: number // in seconds
  attemptSwap: boolean
  gasCost: BigNumber
  gasCostInToken: BigNumber
  gasPrice: BigNumber
  gasLimit: BigNumber
  tokenPriceUsd: number
  nativeTokenPriceUsd: number
  minBonderFeeAbsolute: BigNumber
}

// structure:
// key: `<chain>:<token>:<timestamp>:<attemptSwap>`
// value: `{ ...GasCost }`
class GasCostDb extends BaseDb {
  constructor (prefix: string, _namespace?: string) {
    super(prefix, _namespace)
    this.startPrunePoller()
  }

  private async startPrunePoller () {
    await this.tilReady()
    while (true) {
      try {
        await this.prune()
        await wait(OneHourMs)
      } catch (err) {
        this.logger.error(`prune poller error: ${err.message}`)
      }
    }
  }

  async update (key: string, data: GasCost) {
    return this._update(key, data)
  }

  async addGasCost (data: GasCost) {
    const key = `${data.chain}:${data.token}:${data.timestamp}:${Number(data.attemptSwap)}`
    await this.update(key, data)
    this.logger.debug(`updated db gasCost item. ${JSON.stringify(data)}`)
  }

  async getItems (filter?: KeyFilter): Promise<GasCost[]> {
    const items: GasCost[] = await this.getValues(filter)
    return items.filter(x => x)
  }

  async getNearest (chain: string, token: string, attemptSwap: boolean, targetTimestamp: number): Promise<GasCost | null> {
    await this.tilReady()
    const startTimestamp = targetTimestamp - OneHourSeconds
    const endTimestamp = targetTimestamp + OneHourSeconds
    const filter = {
      gte: `${chain}:${token}:${startTimestamp}`,
      lte: `${chain}:${token}:${endTimestamp}~`
    }
    const items: GasCost[] = (await this.getItems(filter)).filter((item: GasCost) => {
      return (
        item.chain === chain &&
        item.token === token &&
        item.attemptSwap === attemptSwap &&
        item.timestamp
      )
    })

    const dates = items.map((item: GasCost) => item.timestamp)
    const index = nearest(dates, targetTimestamp)
    if (index === -1) {
      return null
    }
    const item = normalizeDbItem(items[index])
    const isTooFar = Math.abs(item.timestamp - targetTimestamp) > varianceSeconds
    if (isTooFar) {
      return null
    }
    return item
  }

  private async getOldEntries (): Promise<GasCost[]> {
    await this.tilReady()
    const oneWeekAgo = Math.floor((Date.now() - OneWeekMs) / 1000)
    const items = (await this.getKeyValues())
      .map((kv: any) => {
        kv.value.id = kv.key
        return kv.value
      })
      .filter((item: GasCost) => item.timestamp < oneWeekAgo)

    return items
  }

  private async prune (): Promise<void> {
    await this.tilReady()
    const items = await this.getOldEntries()
    this.logger.debug(`items to prune: ${items.length}`)
    for (const { chain, token, timestamp, id } of items) {
      try {
        if (!id) {
          throw new Error(`id not found for ${chain}:${token}:${timestamp}`)
        }
        await this.deleteById(id)
      } catch (err) {
        this.logger.error(`error pruning db item: ${err.message}`)
      }
    }
  }
}

export default GasCostDb
