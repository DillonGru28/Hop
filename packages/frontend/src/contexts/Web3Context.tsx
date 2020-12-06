import React, {
  FC,
  createContext,
  useContext,
  useMemo,
  useEffect,
  useCallback,
  useState
} from 'react'
import Onboard from 'bnc-onboard'
import { ethers } from 'ethers'
import Address from 'src/models/Address'
import {
  l1RpcUrl,
  l1NetworkId,
  infuraKey,
  blocknativeDappid,
  fortmaticApiKey,
  portisDappId
} from 'src/config'

type Props = {
  onboard: any
  provider: ethers.providers.Web3Provider | undefined
  address: Address | undefined
  requiredNetworkId: string
  setRequiredNetworkId: (networkId: string) => void
  validConnectedNetworkId: boolean
  requestWallet: () => void
}

const initialState = {
  onboard: undefined,
  provider: undefined,
  address: undefined,
  requiredNetworkId: '',
  validConnectedNetworkId: false,
  setRequiredNetworkId: (networkId: string) => {},
  requestWallet: () => {}
}

const Web3Context = createContext<Props>(initialState)

const Web3ContextProvider: FC = ({ children }) => {
  const [provider, setProvider] = useState<
    ethers.providers.Web3Provider | undefined
  >()
  const [requiredNetworkId, setRequiredNetworkId] = useState<string>('')
  const [connectedNetworkId, setConnectedNetworkId] = useState<string>('')
  const [validConnectedNetworkId, setValidConnectedNetworkId] = useState<
    boolean
  >(false)
  const onboard = useMemo(() => {
    const cacheKey = 'selectedWallet'
    const rpcUrl = l1RpcUrl
    const walletOptions = [
      { walletName: 'metamask', preferred: true },
      {
        walletName: 'walletConnect',
        infuraKey,
        preferred: true
      },
      { walletName: 'ledger', rpcUrl, preferred: true },
      {
        walletName: 'trezor',
        appUrl: 'hop.exchange',
        email: 'contact@hop.exchange',
        rpcUrl,
        preferred: true
      },
      { walletName: 'dapper' },
      { walletName: 'fortmatic', apiKey: fortmaticApiKey },
      { walletName: 'portis', apiKey: portisDappId, label: 'Portis' },
      { walletName: 'torus' },
      { walletName: 'coinbase' },
      { walletName: 'trust', rpcUrl },
      { walletName: 'authereum' },
      { walletName: 'opera' },
      { walletName: 'operaTouch' },
      { walletName: 'status' },
      { walletName: 'imToken', rpcUrl }
    ]

    const instance = Onboard({
      dappId: blocknativeDappid,
      networkId: Number(l1NetworkId),
      walletSelect: {
        wallets: walletOptions
      },
      subscriptions: {
        wallet: (wallet: any) => {
          localStorage.setItem(cacheKey, wallet.name)
          setProvider(new ethers.providers.Web3Provider(wallet.provider))
        },
        network: (connectedNetworkId: number) => {
          setConnectedNetworkId(connectedNetworkId.toString())
        }
      }
    })

    const cachedWallet = window.localStorage.getItem(cacheKey)
    if (cachedWallet) {
      instance.walletSelect(cachedWallet)
    }

    return instance
  }, [setProvider, setConnectedNetworkId])

  useEffect(() => {
    if (requiredNetworkId) {
      onboard.config({ networkId: Number(requiredNetworkId) })
      if (onboard.getState().address) {
        onboard.walletCheck()
      }
    }
  }, [onboard, requiredNetworkId, connectedNetworkId])

  useEffect(() => {
    if (onboard.getState().address) {
      setValidConnectedNetworkId(connectedNetworkId === requiredNetworkId)
    } else {
      setValidConnectedNetworkId(false)
    }
  }, [onboard, connectedNetworkId, requiredNetworkId])

  const [address, setAddress] = useState<Address | undefined>()

  const requestWallet = useCallback(() => {
    const _requestWallet = async () => {
      try {
        await onboard.walletSelect()
        await onboard.walletCheck()
      } catch (err) {
        console.error(err)
      }
    }

    _requestWallet()
  }, [onboard])

  useEffect(() => {
    const getAddress = async () => {
      const addressString = await provider?.getSigner().getAddress()
      if (addressString) {
        setAddress(Address.from(addressString))
      }
    }

    getAddress()
  }, [provider])

  return (
    <Web3Context.Provider
      value={{
        onboard,
        provider,
        address,
        requiredNetworkId,
        setRequiredNetworkId,
        validConnectedNetworkId,
        requestWallet
      }}
    >
      {children}
    </Web3Context.Provider>
  )
}

export const useWeb3Context: () => Props = () => useContext(Web3Context)

export default Web3ContextProvider
