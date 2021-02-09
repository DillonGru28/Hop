import React, { FC, createContext, useContext, useState, useMemo } from 'react'
import { Contract } from 'ethers'
import { parseUnits, formatUnits } from 'ethers/lib/utils'
import Token from 'src/models/Token'
import Network from 'src/models/Network'
import Transaction from 'src/models/Transaction'
import { useApp } from 'src/contexts/AppContext'
import { useWeb3Context } from 'src/contexts/Web3Context'
import { addresses } from 'src/config'
import { UINT256, ARBITRUM, OPTIMISM } from 'src/config/constants'
import l2OptimismTokenArtifact from 'src/abi/L2_OptimismERC20.json'
import logger from 'src/logger'
import { contractNetworkSlugToChainId } from 'src/utils'

type ConvertContextProps = {
  selectedToken: Token | undefined
  selectedNetwork: Network | undefined
  setSelectedNetwork: (network: Network | undefined) => void
  sourceNetwork: Network | undefined
  setSourceNetwork: (network: Network) => void
  sourceNetworks: Network[]
  destNetwork: Network | undefined
  setDestNetwork: (network: Network) => void
  sourceTokenAmount: string | undefined
  setSourceTokenAmount: (value: string) => void
  destTokenAmount: string | undefined
  setDestTokenAmount: (value: string) => void
  convertTokens: () => void
  validFormFields: boolean
  calcAltTokenAmount: (value: string) => Promise<string>
  sending: boolean
  sendButtonText: string
  sourceTokenBalance: number | null
  destTokenBalance: number | null
  setSourceTokenBalance: (balance: number | null) => void
  setDestTokenBalance: (balance: number | null) => void
  networkPairMap: any
  convertCanonicalBridgeNetworks: string[]
  convertHopBridgeNetworks: string[]
  error: string | null | undefined
  setError: (error: string | null | undefined) => void
}

const ConvertContext = createContext<ConvertContextProps>({
  selectedToken: undefined,
  selectedNetwork: undefined,
  setSelectedNetwork: (network: Network | undefined) => {},
  sourceNetwork: undefined,
  setSourceNetwork: (network: Network) => {},
  sourceNetworks: [],
  destNetwork: undefined,
  setDestNetwork: (network: Network) => {},
  sourceTokenAmount: undefined,
  setSourceTokenAmount: (value: string) => {},
  destTokenAmount: undefined,
  setDestTokenAmount: (value: string) => {},
  convertTokens: () => {},
  validFormFields: false,
  calcAltTokenAmount: async (value: string): Promise<string> => '',
  sending: false,
  sendButtonText: '',
  sourceTokenBalance: null,
  destTokenBalance: null,
  setSourceTokenBalance: (balance: number | null) => {},
  setDestTokenBalance: (balance: number | null) => {},
  networkPairMap: {},
  convertCanonicalBridgeNetworks: [],
  convertHopBridgeNetworks: [],
  error: null,
  setError: (error: string | null | undefined) => {}
})

const ConvertContextProvider: FC = ({ children }) => {
  const { provider, getWriteContract } = useWeb3Context()
  const app = useApp()
  let { networks: nets, tokens, contracts, txConfirm } = app
  const l1Bridge = contracts?.l1Bridge
  const networks: Network[] = useMemo(() => {
    const l1Networks = nets.filter((network: Network) => network.isLayer1)
    const l2Networks = nets.filter((network: Network) => !network.isLayer1)
    const l2CanonicalNetworks = l2Networks.map((network: Network) => {
      return new Network({
        name: `${network.name} Canonical`,
        slug: network.slug,
        imageUrl: network.imageUrl,
        rpcUrl: network.rpcUrl,
        networkId: network.networkId
      })
    })
    const l2HopBridges = l2Networks.map((network: Network) => {
      return new Network({
        name: `${network.name} Hop Bridge`,
        slug: `${network.slug}HopBridge`,
        imageUrl: network.imageUrl,
        rpcUrl: network.rpcUrl,
        networkId: network.networkId
      })
    })
    return [...l1Networks, ...l2CanonicalNetworks, ...l2HopBridges]
  }, [nets])
  const convertCanonicalBridgeNetworks = networks
    .filter((network: Network) => {
      return network.isLayer1 || !network.slug.includes('Bridge')
    })
    .map((network: Network) => network.slug)
  const convertHopBridgeNetworks = networks
    .filter((network: Network) => {
      return network.isLayer1 || network.slug.includes('Bridge')
    })
    .map((network: Network) => network.slug)
  const [sourceNetworks] = useState<Network[]>(networks)
  tokens = tokens.filter((token: Token) => ['DAI'].includes(token.symbol))
  const [selectedToken] = useState<Token>(tokens[0])
  const [selectedNetwork, setSelectedNetwork] = useState<Network | undefined>(
    undefined
  )
  const [sourceNetwork, setSourceNetwork] = useState<Network | undefined>(
    sourceNetworks[0]
  )
  const [destNetwork, setDestNetwork] = useState<Network | undefined>()
  const [sourceTokenAmount, setSourceTokenAmount] = useState<string>('')
  const [destTokenAmount, setDestTokenAmount] = useState<string>('')
  const [sending, setSending] = useState<boolean>(false)
  const [sourceTokenBalance, setSourceTokenBalance] = useState<number | null>(
    null
  )
  const [destTokenBalance, setDestTokenBalance] = useState<number | null>(null)
  const [error, setError] = useState<string | null | undefined>()
  const canonicalSlug = (network: Network) => {
    if (network?.isLayer1) {
      return ''
    }
    return network?.slug?.replace('HopBridge', '')
  }
  const isHopBridge = (slug: string | undefined) => {
    if (!slug) return false
    return slug.includes('Bridge')
  }
  const networkPairMap = networks.reduce((obj, network) => {
    if (network.isLayer1) {
      return obj
    }
    if (isHopBridge(network?.slug)) {
      obj[canonicalSlug(network)] = network?.slug
    } else {
      obj[network?.slug] = canonicalSlug(network)
    }
    return obj
  }, {} as any)

  const calcAltTokenAmount = async (value: string) => {
    if (value) {
      if (!sourceNetwork) {
        return ''
      }
      if (!destNetwork) {
        return ''
      }
      const slug = canonicalSlug(sourceNetwork)
      if (!slug) {
        return value
      }
      const router = contracts?.networks[slug].uniswapRouter
      if (networkPairMap[sourceNetwork?.slug] === destNetwork?.slug) {
        let path = [
          addresses.networks[slug].l2CanonicalToken,
          addresses.networks[slug].l2Bridge
        ]
        if (destNetwork?.slug === slug) {
          path = [
            addresses.networks[slug].l2Bridge,
            addresses.networks[slug].l2CanonicalToken
          ]
        }

        const amountsOut = await router?.getAmountsOut(
          parseUnits(value, 18),
          path
        )
        value = Number(formatUnits(amountsOut[1].toString(), 18)).toFixed(2)
      }
    }

    return value
  }

  const convertTokens = async () => {
    try {
      if (!Number(sourceTokenAmount)) {
        return
      }

      if (!sourceNetwork) {
        return
      }

      setSending(true)
      const approveTokens = async (
        token: Token,
        amount: string,
        network: Network,
        targetAddress: string
      ): Promise<any> => {
        const signer = provider?.getSigner()
        const tokenAddress = token.addressForNetwork(network).toString()
        const contractRead = contracts?.getErc20Contract(tokenAddress, signer)
        let contract = await getWriteContract(contractRead)

        const parsedAmount = parseUnits(amount, token.decimals || 18)
        const approved = await contract?.allowance(
          await signer?.getAddress(),
          targetAddress
        )

        let tx: any
        if (approved.lt(parsedAmount)) {
          tx = await txConfirm?.show({
            kind: 'approval',
            inputProps: {
              amount,
              token
            },
            onConfirm: async (approveAll: boolean) => {
              const approveAmount = approveAll ? UINT256 : parsedAmount
              return contract?.approve(targetAddress, approveAmount)
            }
          })
        }

        if (tx?.hash && sourceNetwork) {
          app?.txHistory?.addTransaction(
            new Transaction({
              hash: tx?.hash,
              networkName: sourceNetwork?.slug
            })
          )
        }
        await tx?.wait()
        return tx
      }

      const signer = provider?.getSigner()
      const address = await signer?.getAddress()
      const value = parseUnits(sourceTokenAmount, 18).toString()
      let tx: any
      const sourceSlug = canonicalSlug(sourceNetwork)

      // source network is L1 ( L1 -> L2 )
      if (sourceNetwork?.isLayer1) {
        // destination network is L2 hop bridge ( L1 -> L2 Hop )
        if (destNetwork && isHopBridge(destNetwork?.slug)) {
          await approveTokens(
            selectedToken,
            sourceTokenAmount,
            sourceNetwork as Network,
            l1Bridge?.address as string
          )

          const tokenAddress = selectedToken
            .addressForNetwork(sourceNetwork)
            .toString()

          tx = await txConfirm?.show({
            kind: 'convert',
            inputProps: {
              source: {
                amount: sourceTokenAmount,
                token: selectedToken
              },
              dest: {
                amount: destTokenAmount,
                token: selectedToken
              }
            },
            onConfirm: async () => {
              const l1BridgeWrite = await getWriteContract(l1Bridge)
              return l1BridgeWrite?.sendToL2(
                contractNetworkSlugToChainId(canonicalSlug(destNetwork)),
                address,
                value
              )
            }
          })

          // destination network is canonical bridge (L1 -> L2 canonical)
        } else if (destNetwork && !isHopBridge(destNetwork?.slug)) {
          const destSlug = destNetwork?.slug
          const messenger = contracts?.networks[destSlug]?.l1CanonicalBridge
          await approveTokens(
            selectedToken,
            sourceTokenAmount,
            sourceNetwork as Network,
            messenger?.address as string
          )

          const tokenAddress = selectedToken
            .addressForNetwork(sourceNetwork)
            .toString()

          tx = await txConfirm?.show({
            kind: 'convert',
            inputProps: {
              source: {
                amount: sourceTokenAmount,
                token: selectedToken
              },
              dest: {
                amount: destTokenAmount,
                token: selectedToken
              }
            },
            onConfirm: async () => {
              if (destSlug === ARBITRUM) {
                const messengerWrite = await getWriteContract(messenger)
                return messengerWrite?.depositERC20Message(
                  addresses.networks.arbitrum?.arbChain,
                  tokenAddress,
                  address,
                  value
                )
              } else if (destSlug === OPTIMISM) {
                return messenger?.deposit(address, value, true)
              }
            }
          })
        }

        // source network is L2 canonical bridge ( L2 canonical -> L1 or L2 )
      } else if (
        sourceNetwork &&
        !sourceNetwork?.isLayer1 &&
        !isHopBridge(sourceNetwork?.slug)
      ) {
        // destination network is L1 ( L2 canonical -> L1 )
        if (destNetwork?.isLayer1) {
          const tokenAddress = selectedToken
            .addressForNetwork(sourceNetwork)
            .toString()

          tx = await txConfirm?.show({
            kind: 'convert',
            inputProps: {
              source: {
                amount: sourceTokenAmount,
                token: selectedToken
              },
              dest: {
                amount: destTokenAmount,
                token: selectedToken
              }
            },
            onConfirm: async () => {
              if (sourceSlug === ARBITRUM) {
                const contract = await getWriteContract(
                  contracts?.networks[sourceSlug].l2CanonicalToken
                )
                return contract?.withdraw(tokenAddress, value)
              } else if (sourceSlug === OPTIMISM) {
                const l2Provider = provider?.getSigner()
                const l2Token = await getWriteContract(
                  new Contract(
                    addresses.networks[sourceSlug].l2CanonicalToken,
                    l2OptimismTokenArtifact.abi,
                    l2Provider
                  )
                )
                return l2Token?.withdraw(value)
              }
            }
          })

          // destination network is L2 hop bridge (L2 canonical -> L2 Hop)
        } else if (isHopBridge(destNetwork?.slug)) {
          const router = contracts?.networks[sourceSlug].uniswapRouter
          await approveTokens(
            selectedToken,
            sourceTokenAmount,
            sourceNetwork as Network,
            router?.address as string
          )

          const amountOutMin = '0'
          const path = [
            addresses.networks[sourceSlug].l2CanonicalToken,
            addresses.networks[sourceSlug].l2Bridge
          ]
          const deadline = (Date.now() / 1000 + 300) | 0

          tx = await txConfirm?.show({
            kind: 'convert',
            inputProps: {
              source: {
                amount: sourceTokenAmount,
                token: selectedToken
              },
              dest: {
                amount: destTokenAmount,
                token: selectedToken
              }
            },
            onConfirm: async () => {
              const routerWrite = await getWriteContract(router)
              return routerWrite?.swapExactTokensForTokens(
                value,
                amountOutMin,
                path,
                address,
                deadline
              )
            }
          })
        }

        // source network is L2 hop bridge ( L2 Hop -> L1 or L2 )
      } else if (isHopBridge(sourceNetwork?.slug) && destNetwork) {
        const destNetworkSlug = destNetwork?.slug
        const router = contracts?.networks[destNetworkSlug].uniswapRouter
        const bridge = contracts?.networks[sourceSlug].l2Bridge

        // destination network is L1 ( L2 Hop -> L1 )
        if (destNetwork?.isLayer1) {
          tx = await txConfirm?.show({
            kind: 'convert',
            inputProps: {
              source: {
                amount: sourceTokenAmount,
                token: selectedToken
              },
              dest: {
                amount: destTokenAmount,
                token: selectedToken
              }
            },
            onConfirm: async () => {
              const bridgeWrite = await getWriteContract(bridge)
              return bridgeWrite?.send(
                '1',
                address,
                value,
                Date.now(),
                '0',
                '0',
                '0'
              )
            }
          })

          // destination network is L2 uniswap ( L1 -> L2 Uniswap )
        } else {
          await approveTokens(
            selectedToken,
            sourceTokenAmount,
            sourceNetwork as Network,
            router?.address as string
          )

          const amountOutMin = '0'
          const path = [
            addresses.networks[destNetworkSlug].l2Bridge,
            addresses.networks[destNetworkSlug].l2CanonicalToken
          ]
          const deadline = (Date.now() / 1000 + 300) | 0

          tx = await txConfirm?.show({
            kind: 'convert',
            inputProps: {
              source: {
                amount: sourceTokenAmount,
                token: selectedToken
              },
              dest: {
                amount: destTokenAmount,
                token: selectedToken
              }
            },
            onConfirm: async () => {
              const routerWrite = await getWriteContract(router)
              return routerWrite?.swapExactTokensForTokens(
                value,
                amountOutMin,
                path,
                address,
                deadline
              )
            }
          })
        }
      }

      if (tx?.hash && sourceNetwork?.name) {
        app?.txHistory?.addTransaction(
          new Transaction({
            hash: tx?.hash,
            networkName: sourceNetwork?.slug
          })
        )
      }
    } catch (err) {
      if (!/cancelled/gi.test(err.message)) {
        setError(err.message)
      }
      logger.error(err)
    }

    setSending(false)
  }

  const enoughBalance = Number(sourceTokenBalance) >= Number(sourceTokenAmount)
  const validFormFields = !!(
    sourceTokenAmount &&
    destTokenAmount &&
    enoughBalance
  )
  let sendButtonText = 'Convert'
  if (sourceTokenBalance === null) {
    sendButtonText = 'Fetching balance...'
  } else if (!enoughBalance) {
    sendButtonText = 'Insufficient funds'
  }

  return (
    <ConvertContext.Provider
      value={{
        selectedToken,
        selectedNetwork,
        setSelectedNetwork,
        sourceNetwork,
        setSourceNetwork,
        sourceNetworks,
        destNetwork,
        setDestNetwork,
        sourceTokenAmount,
        setSourceTokenAmount,
        destTokenAmount,
        setDestTokenAmount,
        convertTokens,
        validFormFields,
        calcAltTokenAmount,
        sending,
        sendButtonText,
        sourceTokenBalance,
        destTokenBalance,
        setSourceTokenBalance,
        setDestTokenBalance,
        networkPairMap,
        convertCanonicalBridgeNetworks,
        convertHopBridgeNetworks,
        error,
        setError
      }}
    >
      {children}
    </ConvertContext.Provider>
  )
}

export const useConvert = () => useContext(ConvertContext)

export default ConvertContextProvider
