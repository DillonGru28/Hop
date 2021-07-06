import { Contract } from 'ethers'
import { EventEmitter } from 'events'
import { wait } from 'src/utils'
import Logger from 'src/logger'
import { Notifier } from 'src/notifier'
import { hostname } from 'src/config'
import L1Bridge from './L1Bridge'
import L2Bridge from './L2Bridge'
import { IBaseWatcher } from './IBaseWatcher'

interface Config {
  chainSlug: string
  tag: string
  prefix?: string
  logColor?: string
  order?: () => number
  isL1?: boolean
  bridgeContract?: Contract
  dryMode?: boolean
}

interface EventsBatchOptions {
  key?: string
  startBlockNumber?: number
  endBlockNumber?: number
}

class BaseWatcher extends EventEmitter implements IBaseWatcher {
  logger: Logger
  notifier: Notifier
  order: () => number = () => 0
  started: boolean = false
  pollIntervalSec: number = 10 * 1000
  resyncIntervalSec: number = 10 * 60 * 1000
  chainSlug: string
  initialSyncCompleted: boolean = false

  isL1: boolean
  bridge: L2Bridge | L1Bridge
  siblingWatchers: { [chainId: string]: any }
  dryMode: boolean
  tag: string
  prefix: string

  constructor (config: Config) {
    super()
    const { chainSlug, tag, prefix, order, logColor } = config
    this.logger = new Logger({
      tag,
      prefix,
      color: logColor
    })
    this.chainSlug = chainSlug
    if (tag) {
      this.tag = tag
    }
    if (prefix) {
      this.prefix = prefix
    }
    if (order) {
      this.order = order
    }
    this.notifier = new Notifier(
      `watcher: ${tag}, label: ${prefix}, host: ${hostname}`
    )
    if (config.isL1) {
      this.isL1 = config.isL1
    }
    if (config.bridgeContract) {
      if (this.isL1) {
        this.bridge = new L1Bridge(config.bridgeContract)
      } else {
        this.bridge = new L2Bridge(config.bridgeContract)
      }
    }
    if (config.dryMode) {
      this.dryMode = config.dryMode
    }
  }

  async pollSync () {
    await this.preSyncHandler()
    await this.syncHandler()
    await this.postSyncHandler()
  }

  async preSyncHandler () {
    this.logger.debug('syncing up events')
  }

  async syncHandler () {
    // virtual method
  }

  async postSyncHandler () {
    this.logger.debug('done syncing')
    this.initialSyncCompleted = true
    await wait(this.resyncIntervalSec)
    await this.pollSync()
  }

  async watch () {
    // virtual method
  }

  async pollCheck () {
    if (!this.started) {
      return
    }
    try {
      await this.prePollHandler()
      await this.pollHandler()
    } catch (err) {
      this.logger.error(`poll check error: ${err.message}`)
      this.notifier.error(`poll check error: ${err.message}`)
    }
    await this.postPollHandler()
  }

  async prePollHandler () {
    // empty by default
  }

  async pollHandler () {
    // virtual method
  }

  async postPollHandler () {
    await wait(this.pollIntervalSec)
    await this.pollCheck()
  }

  async start () {
    this.started = true
    try {
      await Promise.all([this.pollSync(), this.pollCheck(), this.watch()])
    } catch (err) {
      this.logger.error(`base watcher error:`, err.message)
      this.notifier.error(`base watcher error: '${err.message}`)
      console.error(err)
      this.quit()
    }
  }

  async stop (): Promise<void> {
    this.bridge.removeAllListeners()
    this.started = false
    this.logger.setEnabled(false)
  }

  isInitialSyncCompleted (): boolean {
    return this.initialSyncCompleted
  }

  isAllSiblingWatchersInitialSyncCompleted (): boolean {
    return Object.values(this.siblingWatchers).every(
      (siblingWatcher: BaseWatcher) => {
        return siblingWatcher.isInitialSyncCompleted()
      }
    )
  }

  hasSiblingWatcher (chainId: number): boolean {
    return this.siblingWatchers && !!this.siblingWatchers[chainId]
  }

  getSiblingWatcherByChainSlug (chainSlug: string): any {
    return this.siblingWatchers[this.chainSlugToId(chainSlug)]
  }

  getSiblingWatcherByChainId (chainId: number): any {
    if (!this.hasSiblingWatcher(chainId)) {
      throw new Error(
        `sibling watcher for chain id ${chainId} not found. Check configuration`
      )
    }
    return this.siblingWatchers[chainId]
  }

  setSiblingWatchers (watchers: any): void {
    this.siblingWatchers = watchers
  }

  chainIdToSlug (chainId: number): string {
    return this.bridge.chainIdToSlug(chainId)
  }

  chainSlugToId (chainSlug: string): number {
    return this.bridge.chainSlugToId(chainSlug)
  }

  cacheKey (key: string) {
    return `${this.tag}:${key}`
  }

  // force quit so docker can restart
  public async quit () {
    console.trace()
    this.logger.info(`exiting`)
    process.exit(1)
  }
}

export default BaseWatcher
