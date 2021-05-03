import '../moduleAlias'
import { config, hostname as configHostname } from 'src/config'
import { ETHEREUM, OPTIMISM, ARBITRUM, XDAI, POLYGON } from 'src/constants'
import contracts from 'src/contracts'
import CommitTransferWatcher from 'src/watchers/CommitTransferWatcher'
import BondTransferRootWatcher from 'src/watchers/BondTransferRootWatcher'
import BondWithdrawalWatcher from 'src/watchers/BondWithdrawalWatcher'
import ChallengeWatcher from 'src/watchers/ChallengeWatcher'
import SettleBondedWithdrawalWatcher from 'src/watchers/SettleBondedWithdrawalWatcher'
import StakeWatcher from 'src/watchers/StakeWatcher'
import { store } from 'src/store'
import PubSub from 'src/pubsub/PubSub'
import Logger from 'src/logger'
import { networkSlugToId } from 'src/utils'

const networks = [OPTIMISM, ARBITRUM, XDAI, POLYGON]
const pubsubLogger = new Logger('pubsub', { color: 'magenta' })

interface StakeAmounts {
  [key: string]: number
}

function startStakeWatchers (
  _tokens?: string[],
  _networks: string[] = networks,
  maxStakeAmounts: StakeAmounts = {}
) {
  if (!_tokens) {
    _tokens = Object.keys(config.tokens)
  }
  _networks = (_networks || networks).filter(x => networks.includes(x))
  let stakeWatchers: any = {}
  const watchers: any[] = []
  for (let token of _tokens) {
    for (let network of [ETHEREUM].concat(_networks)) {
      const networkId = networkSlugToId(network)
      const tokenContracts = contracts.get(token, network)
      if (!tokenContracts) {
        continue
      }
      let bridgeContract = tokenContracts.l2Bridge
      let tokenContract = tokenContracts.l2HopBridgeToken
      if (network === ETHEREUM) {
        bridgeContract = tokenContracts.l1Bridge
        tokenContract = tokenContracts.l1CanonicalToken
      }

      const stakeWatcher = new StakeWatcher({
        isL1: network === 'ethereum',
        label: `${network} ${token}`,
        bridgeContract,
        tokenContract,
        stakeMinThreshold: 0,
        maxStakeAmount: maxStakeAmounts[token]
      })

      stakeWatchers[token] = stakeWatchers[token] || {}
      stakeWatchers[token][networkId] = stakeWatcher
      watchers.push(stakeWatcher)
    }
  }

  for (let token in stakeWatchers) {
    for (let network in stakeWatchers[token]) {
      stakeWatchers[token][network].setSiblingWatchers(stakeWatchers[token])
    }
  }

  watchers.forEach(watcher => watcher.start())
  return watchers
}

type Config = {
  order?: number
  tokens?: string[]
  networks?: string[]
  bonder?: boolean
  challenger?: boolean
  maxStakeAmounts?: StakeAmounts
}

function startWatchers (
  _config: Config = {
    order: 0,
    tokens: Object.keys(config.tokens),
    networks: networks,
    bonder: true,
    challenger: false,
    maxStakeAmounts: {}
  }
) {
  const orderNum = _config.order || 0
  let _tokens = _config.tokens
  let _networks = _config.networks.filter(x => networks.includes(x))
  if (!_tokens || !_tokens.length) {
    _tokens = Object.keys(config.tokens)
  }
  if (!_networks.length) {
    _networks = networks
  }
  const watchers: any[] = []
  try {
    const hostname = configHostname
    const pubsub = new PubSub()
    const topic = '/hop-protocol/bonders'
    pubsub.subscribe(topic, (data: any) => {
      if (!(data && data.hostname)) {
        return
      }

      if (data.hostname === hostname) {
        return
      }

      if (!store.bonders[data.hostname]) {
        if (data.order === orderNum) {
          pubsubLogger.warn(
            `Warning: host "${hostname}" has same order number "${data.order}"`
          )
        }

        pubsubLogger.info(
          `Bonder "${data.hostname}" (order ${data.order}) is online`
        )
      }

      if (store.bonders[data.hostname] && !store.bonders[data.hostname].up) {
        pubsubLogger.info(
          `Bonder "${data.hostname}" (order ${data.order}) is back online`
        )
      }

      store.bonders[data.hostname] = {
        hostname: data.hostname,
        order: data.order,
        timestamp: Date.now(),
        up: true
      }
    })

    setInterval(() => {
      pubsub.publish(topic, {
        hostname,
        order: orderNum
      })

      for (let k in store.bonders) {
        const v = store.bonders[k]
        if (v.up) {
          if (Date.now() - v.timestamp > 10 * 1000) {
            pubsubLogger.info(
              `Bonder "${v.hostname}" (order ${v.order}) appears to be down`
            )
            v.up = false
          }
        }
      }
    }, 3 * 1000)
  } catch (err) {
    pubsubLogger.error(err)
  }

  const order = () => {
    let delta = 0
    for (let k in store.bonders) {
      const v = store.bonders[k]
      if (!v.up && v.order === orderNum - 1) {
        delta = 1
      }
    }

    return Math.max(orderNum - delta, 0)
  }

  let bondWithdrawalWatchers: any = {}
  let bondTransferRootWatchers: any = {}
  let settleBondedWithdrawalWatchers: any = {}
  let commitTransferWatchers: any = {}
  for (let network of ['ethereum'].concat(_networks)) {
    const networkId = networkSlugToId(network)
    for (let token of _tokens) {
      if (!contracts.has(token, network)) {
        continue
      }
      const label = `${network} ${token}`
      const isL1 = network === 'ethereum'

      const bridgeContract = isL1
        ? contracts.get(token, ETHEREUM).l1Bridge
        : contracts.get(token, network).l2Bridge

      const bondWithdrawalWatcher = new BondWithdrawalWatcher({
        order,
        label,
        isL1,
        bridgeContract
      })

      bondWithdrawalWatchers[token] = bondWithdrawalWatchers[token] || {}
      bondWithdrawalWatchers[token][networkId] = bondWithdrawalWatcher
      watchers.push(bondWithdrawalWatcher)

      const bondTransferRootWatcher = new BondTransferRootWatcher({
        order,
        label,
        isL1,
        bridgeContract
      })

      bondTransferRootWatchers[token] = bondTransferRootWatchers[token] || {}
      bondTransferRootWatchers[token][networkId] = bondTransferRootWatcher
      watchers.push(bondTransferRootWatcher)

      const settleBondedWithdrawalWatcher = new SettleBondedWithdrawalWatcher({
        order,
        label,
        isL1,
        bridgeContract
      })

      settleBondedWithdrawalWatchers[token] =
        settleBondedWithdrawalWatchers[token] || {}
      settleBondedWithdrawalWatchers[token][
        networkId
      ] = settleBondedWithdrawalWatcher
      watchers.push(settleBondedWithdrawalWatcher)

      const commitTransferWatcher = new CommitTransferWatcher({
        order,
        label,
        isL1,
        bridgeContract
      })

      commitTransferWatchers[token] = commitTransferWatchers[token] || {}
      commitTransferWatchers[token][networkId] = commitTransferWatcher

      watchers.push(commitTransferWatcher)
    }
  }

  for (let token in bondWithdrawalWatchers) {
    for (let network in bondWithdrawalWatchers[token]) {
      bondWithdrawalWatchers[token][network].setSiblingWatchers(
        bondWithdrawalWatchers[token]
      )
    }
  }

  for (let token in bondTransferRootWatchers) {
    for (let network in bondTransferRootWatchers[token]) {
      bondTransferRootWatchers[token][network].setSiblingWatchers(
        bondTransferRootWatchers[token]
      )
    }
  }

  for (let token in settleBondedWithdrawalWatchers) {
    for (let network in settleBondedWithdrawalWatchers[token]) {
      settleBondedWithdrawalWatchers[token][network].setSiblingWatchers(
        settleBondedWithdrawalWatchers[token]
      )
    }
  }

  for (let token in commitTransferWatchers) {
    for (let network in commitTransferWatchers[token]) {
      commitTransferWatchers[token][network].setSiblingWatchers(
        commitTransferWatchers[token]
      )
    }
  }

  if (_config?.bonder || _config?.bonder === undefined) {
    watchers.forEach(watcher => watcher.start())
    watchers.push(
      ...startStakeWatchers(_tokens, _networks, _config.maxStakeAmounts)
    )
  }

  if (_config?.challenger) {
    watchers.push(...startChallengeWatchers(_tokens, _networks))
  }

  const stop = () => {
    return watchers.map(watcher => {
      return watcher.stop()
    })
  }

  return { stop, watchers }
}

function startChallengeWatchers (_tokens?: string[], _networks?: string[]) {
  if (!_tokens) {
    _tokens = Object.keys(config.tokens)
  }
  if (!_networks) {
    _tokens = Object.keys(config.networks)
  }

  const watchers: any[] = []
  for (let network of _networks) {
    for (let token of _tokens) {
      if (!contracts.has(token, network)) {
        continue
      }
      /*
      watchers.push(
        new ChallengeWatcher({
          label: network,
          l1BridgeContract: contracts.get(token, ETHEREUM).l1Bridge,
          l2BridgeContract: contracts.get(token, network).l2Bridge,
          contracts: {
            '1': contracts.get(token, ETHEREUM)?.l1Bridge,
            '42': contracts.get(token, ETHEREUM)?.l1Bridge,
            '5': contracts.get(token, ETHEREUM)?.l1Bridge,
            '69': contracts.get(token, OPTIMISM)?.l2Bridge,
            '79377087078960': contracts.get(token, ARBITRUM)?.l2Bridge,
            '77': contracts.get(token, XDAI)?.l2Bridge,
            '80001': contracts.get(token, POLYGON)?.l2Bridge
          }
        })
      )
				*/
    }
  }
  watchers.forEach(watcher => watcher.start())
  return watchers
}

function startCommitTransferWatchers () {
  const watchers: any[] = []
  const tokens = Object.keys(config.tokens)
  for (let network of networks) {
    for (let token of tokens) {
      /*
      watchers.push(
        new CommitTransferWatcher({
          label: network,
          l2BridgeContract: contracts.get[token][network].l2Bridge,
          // TODO
          contracts: {
            '1': contracts.get(token, ETHEREUM)?.l1Bridge,
            '42': contracts.get(token, ETHEREUM)?.l1Bridge,
            '5': contracts.get(token, ETHEREUM)?.l1Bridge,
            '69': contracts.get(token, OPTIMISM)?.l2Bridge,
            '79377087078960': contracts.get(token, ARBITRUM)?.l2Bridge,
            '77': contracts.get(token, XDAI)?.l2Bridge,
            '80001': contracts.get(token, POLYGON)?.l2Bridge
          }
        })
      )
			*/
    }
  }
  watchers.forEach(watcher => watcher.start())
  return watchers
}

export {
  startWatchers,
  startStakeWatchers,
  startChallengeWatchers,
  startCommitTransferWatchers
}
