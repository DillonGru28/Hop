const { metadata } = require('./metadata')
const mainnet = require('./mainnet')
const staging = require('./staging')
const kovan = require('./kovan')
const goerli = require('./goerli')

const addresses: { [network: string]: any } = {
  mainnet: mainnet.addresses,
  staging: staging.addresses,
  kovan: kovan.addresses,
  goerli: goerli.addresses
}

const chains: { [network: string]: any } = {
  mainnet: mainnet.chains,
  staging: staging.chains,
  kovan: kovan.chains,
  goerli: goerli.chains
}

const bonders: { [network: string]: { [token: string]: Record<string, Record<string, string>>} } = {
  mainnet: mainnet.bonders,
  staging: staging.bonders,
  kovan: kovan.bonders,
  goerli: goerli.bonders
}

type Bps = {
  ethereum: number
  polygon: number
  xdai: number
  optimism: number
  arbitrum: number
}

const bonderFeeBps: { [network: string]: { [token: string]: Record<string, number>} } = {
  mainnet: mainnet.bonderFeeBps,
  staging: staging.bonderFeeBps,
  kovan: kovan.bonderFeeBps,
  goerli: goerli.bonderFeeBps
}

const destinationFeeGasPriceMultiplier : { [network: string]: number } = {
  mainnet: mainnet.gasPriceMultiplier,
  staging: staging.gasPriceMultiplier,
  kovan: kovan.gasPriceMultiplier,
  goerli: goerli.gasPriceMultiplier
}

const config = {
  addresses,
  chains,
  bonders,
  bonderFeeBps,
  destinationFeeGasPriceMultiplier
}

export { metadata, config }

export const bondableChains = ['optimism', 'arbitrum']
