import { Chain } from 'src/constants'
import { FileConfig, getEnabledNetworks, getEnabledTokens } from 'src/config'

function validateTokens (tokens: string[]) {
  const validTokens = getEnabledTokens()
  validateKeys(validTokens, tokens)
}

export function isValidToken (token: string) {
  const validTokens = getEnabledTokens()
  return validTokens.includes(token)
}

export function isValidNetwork (network: string) {
  const networks = getEnabledNetworks()
  return networks.includes(network)
}

export function validateKeys (validKeys: string[] = [], keys: string[]) {
  for (const key of keys) {
    if (!validKeys.includes(key)) {
      throw new Error(`unrecognized key "${key}"`)
    }
  }
}

export async function validateConfig (config?: FileConfig) {
  if (!config) {
    throw new Error('config is required')
  }

  if (!(config instanceof Object)) {
    throw new Error('config must be a JSON object')
  }

  const validSectionKeys = [
    'network',
    'chains',
    'sync',
    'tokens',
    'commitTransfers',
    'bondWithdrawals',
    'settleBondedWithdrawals',
    'roles',
    'watchers',
    'db',
    'logging',
    'keystore',
    'addresses',
    'order',
    'stateUpdateAddress',
    'metrics',
    'fees',
    'routes'
  ]

  const validWatcherKeys = [
    'bondTransferRoot',
    'bondWithdrawal',
    'challenge',
    'commitTransfers',
    'settleBondedWithdrawals',
    'xDomainMessageRelay'
  ]

  const sectionKeys = Object.keys(config)
  validateKeys(validSectionKeys, sectionKeys)
  const validNetworkKeys = [
    Chain.Ethereum,
    Chain.Optimism,
    Chain.Arbitrum,
    Chain.xDai,
    Chain.Polygon
  ]

  if (config.chains) {
    const networkKeys = Object.keys(config.chains)
    validateKeys(validNetworkKeys, networkKeys)
  }

  if (config.roles) {
    const validRoleKeys = ['bonder', 'challenger', 'arbBot', 'xdaiBridge']
    const roleKeys = Object.keys(config.roles)
    validateKeys(validRoleKeys, roleKeys)
  }

  if (config.watchers) {
    const watcherKeys = Object.keys(config.watchers)
    validateKeys(validWatcherKeys, watcherKeys)
  }

  if (config.db) {
    const validDbKeys = ['location']
    const dbKeys = Object.keys(config.db)
    validateKeys(validDbKeys, dbKeys)
  }

  if (config.logging) {
    const validLoggingKeys = ['level']
    const loggingKeys = Object.keys(config.logging)
    validateKeys(validLoggingKeys, loggingKeys)

    if (config?.logging?.level) {
      const validLoggingLevels = ['debug', 'info', 'warn', 'error']
      await validateKeys(validLoggingLevels, [config?.logging?.level])
    }
  }

  if (config.keystore) {
    const validKeystoreProps = [
      'location',
      'pass',
      'passwordFile',
      'parameterStore'
    ]
    const keystoreProps = Object.keys(config.keystore)
    validateKeys(validKeystoreProps, keystoreProps)
  }

  if (config.commitTransfers) {
    const validCommitTransfersKeys = ['minThresholdAmount']
    const commitTransfersKeys = Object.keys(config.commitTransfers)
    validateKeys(validCommitTransfersKeys, commitTransfersKeys)
  }

  if (config.metrics) {
    const validMetricsKeys = ['enabled', 'port']
    const metricsKeys = Object.keys(config.metrics)
    validateKeys(validMetricsKeys, metricsKeys)
  }

  if (config.addresses) {
    const validAddressesProps = [
      'location'
    ]
    const addressesProps = Object.keys(config.addresses)
    validateKeys(validAddressesProps, addressesProps)
  }

  if (config.routes) {
    const sourceChains = Object.keys(config.routes)
    validateKeys(validNetworkKeys, sourceChains)
    for (const sourceChain in config.routes) {
      const destinationChains = Object.keys(config.routes[sourceChain])
      validateKeys(validNetworkKeys, destinationChains)
    }
  }

  if (config.fees) {
    const tokens = Object.keys(config.fees)
    validateTokens(tokens)
    for (const token in config.fees) {
      const chains = Object.keys(config.fees[token])
      validateKeys(validNetworkKeys, chains)
    }
  }
}
