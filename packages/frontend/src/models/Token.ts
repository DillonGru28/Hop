import Network from './Network'
import Address from './Address'
import { BigNumber, BigNumberish, Contract } from 'ethers'

type TokenProps = {
  symbol: string
  tokenName: string
  decimals?: number
  contracts: { [key: string]: Contract | undefined }
  rates: { [key: string]: BigNumberish }
}

class Token {
  readonly symbol: string
  readonly tokenName: string
  readonly decimals: number
  readonly contracts: { [key: string]: Contract | undefined }
  readonly addresses: { [key: string]: Address } = {}
  readonly rates: { [key: string]: BigNumber } = {}

  constructor (props: TokenProps) {
    this.symbol = props.symbol
    this.tokenName = props.tokenName
    this.decimals = props.decimals || 18
    this.contracts = props.contracts
    Object.keys(props.contracts).forEach(key => {
      const contract = props.contracts[key]
      if (contract) {
        this.addresses[key] = new Address(contract.address)
      }
    })
    Object.keys(props.rates).forEach(
      key => (this.rates[key] = BigNumber.from(props.rates[key]))
    )
  }

  networkSymbol (network: Network | undefined) {
    const prefix = network?.slug?.substr(0, 3) || ''

    // don't prefix if symbol already contains a prefix
    return (/^[A-Z]/.test(this.symbol) ? prefix : '') + this.symbol
  }

  contractForNetwork (network: Network): Contract {
    const contract = this.contracts[network.slug]
    if (!contract)
      throw new Error(`No token contract for Network '${network.name}'`)
    return contract
  }

  addressForNetwork (network: Network): Address {
    return new Address(this.contractForNetwork(network).address)
  }

  rateForNetwork (network: Network | undefined): BigNumber {
    if (!network) {
      return BigNumber.from('0')
    }
    return this.rates[network.slug]
  }
}

export default Token
