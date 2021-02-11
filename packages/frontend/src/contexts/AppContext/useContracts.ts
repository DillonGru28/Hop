import { useMemo } from 'react'
import { Contract, Signer, providers } from 'ethers'
import erc20Artifact from 'src/abi/ERC20.json'

import { useWeb3Context } from 'src/contexts/Web3Context'
import { addresses } from 'src/config'
import Network from 'src/models/Network'
import Token from 'src/models/Token'

import useGovernanceContracts, {
  GovernanceContracts
} from 'src/contexts/AppContext/useGovernanceContracts'
import useL1BridgeContract from 'src/contexts/AppContext/useL1BridgeContract'
import useNetworkSpecificContracts, {
  NetworkSpecificContracts
} from 'src/contexts/AppContext/useNetworkSpecificContracts'
import logger from 'src/logger'

export type Contracts = {
  governance: GovernanceContracts
  tokens: {
    [key: string]: {
      [key: string]: {
        [key: string]: Contract
      }
    }
  }
  providers: {
    [key: string]: providers.Provider
  }
  getContract: (
    address: string,
    abi: any[],
    provider: any
  ) => Contract | undefined
  getErc20Contract: (address: string, provider: any) => Contract
}

const useContracts = (networks: Network[], tokens: Token[]): Contracts => {
  //logger.debug('useContracts render')
  const { provider, connectedNetworkId } = useWeb3Context()

  const getContract = (
    address: string,
    abi: any[],
    provider: Signer | providers.Provider | undefined
  ): Contract | undefined => {
    if (!provider) return
    return new Contract(address, abi, provider)
  }

  const getErc20Contract = (
    address: string,
    provider: Signer | providers.Provider
  ): Contract => {
    return getContract(address, erc20Artifact.abi, provider) as Contract
  }

  const l1Network = useMemo(() => {
    return networks.find((network: Network) => network.isLayer1)
  }, [networks]) as Network

  const providers = useMemo(() => {
    return networks.reduce((obj, network) => {
      obj[network.slug] = network.provider
      if (connectedNetworkId === network?.networkId) {
        obj[network.slug] = provider?.getSigner()
      }

      return obj
    }, {} as any)
  }, [networks, connectedNetworkId, provider])

  const tokenMap = tokens.reduce((obj, token) => {
    obj[token.symbol] = networks.reduce((networkMap, network) => {
      if (!addresses.tokens[token.symbol]) {
        return obj
      }
      if (network.isLayer1) {
        networkMap[network.slug] = {
          l1CanonicalToken: new Contract(
            addresses.tokens[token.symbol][network.slug].l1CanonicalToken,
            erc20Artifact.abi,
            providers[network.slug]
          ),
          l1Bridge: useL1BridgeContract(providers[network.slug], token)
        }
      } else {
        if (addresses.tokens[token.symbol][network.slug]) {
          networkMap[network.slug] = useNetworkSpecificContracts(
            l1Network,
            network,
            token
          )
        }
      }
      return networkMap
    }, {} as any)
    return obj
  }, {} as any)

  const governanceContracts = useGovernanceContracts(networks)

  return {
    governance: governanceContracts,
    tokens: tokenMap,
    providers,
    getContract,
    getErc20Contract
  }
}

export default useContracts
