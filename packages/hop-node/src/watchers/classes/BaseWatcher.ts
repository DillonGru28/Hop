import L1Bridge from './L1Bridge'
import L2Bridge from './L2Bridge'
import Logger from 'src/logger'
import SyncWatcher from '../SyncWatcher'
import { Contract } from 'ethers'
import { Db, getDbSet } from 'src/db'
import { EventEmitter } from 'events'
import { IBaseWatcher } from './IBaseWatcher'
import { Notifier } from 'src/notifier'
import { boundClass } from 'autobind-decorator'
import { hostname } from 'src/config'
import { wait } from 'src/utils'

interface Config {
  chainSlug: string
  tokenSymbol: string
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

@boundClass
class BaseWatcher extends EventEmitter implements IBaseWatcher {
  db: Db
  logger: Logger
  notifier: Notifier
  order: () => number = () => 0
  started: boolean = false
  pollIntervalMs: number = 10 * 1000
  chainSlug: string
  tokenSymbol: string

  isL1: boolean
  bridge: L2Bridge | L1Bridge
  siblingWatchers: { [chainId: string]: any }
  syncWatcher: SyncWatcher
  dryMode: boolean
  tag: string
  prefix: string

  constructor (config: Config) {
    super()
    const { chainSlug, tokenSymbol, tag, prefix, order, logColor } = config
    this.logger = new Logger({
      tag,
      prefix,
      color: logColor
    })
    this.chainSlug = chainSlug
    this.tokenSymbol = tokenSymbol
    this.db = getDbSet(tokenSymbol)
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

  isAllSiblingWatchersInitialSyncCompleted (): boolean {
    return this.syncWatcher?.isAllSiblingWatchersInitialSyncCompleted()
  }

  async pollCheck () {
    while (true) {
      if (!this.started) {
        return
      }
      try {
        await this.prePollHandler()
        await this.pollHandler()
      } catch (err) {
        this.logger.error(`poll check error: ${err.message}`)
        this.notifier.error(`poll check error: ${err.message}`)
        console.trace()
      }
      await this.postPollHandler()
    }
  }

  async prePollHandler () {
    // empty by default
  }

  async pollHandler () {
    // virtual method
  }

  async postPollHandler () {
    await wait(this.pollIntervalMs)
  }

  async start () {
    this.started = true
    try {
      await this.pollCheck()
    } catch (err) {
      this.logger.error('base watcher error:', err.message)
      this.notifier.error(`base watcher error: '${err.message}`)
      console.trace()
      this.quit()
    }
  }

  async stop (): Promise<void> {
    this.bridge.removeAllListeners()
    this.started = false
    this.logger.setEnabled(false)
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

  setSyncWatcher (syncWatcher: SyncWatcher): void {
    this.syncWatcher = syncWatcher
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
    this.logger.info('exiting')
    process.exit(1)
  }
}

export default BaseWatcher
