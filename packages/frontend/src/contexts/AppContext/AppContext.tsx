import React, { FC, useMemo, createContext, useContext } from 'react'

import { useWeb3Context } from 'src/contexts/Web3Context'
import User from 'src/models/User'
import Token from 'src/models/Token'
import Network from 'src/models/Network'
import useNetworks from './useNetworks'
import useTokens from './useTokens'
import useTxHistory, { TxHistory } from './useTxHistory'
import useContracts, { Contracts } from './useContracts'
import useEvents, { Events } from './useEvents'
import { useAccountDetails, AccountDetails } from './useAccountDetails'
import { useTxConfirm, TxConfirm } from './useTxConfirm'
import logger from 'src/logger'

type AppContextProps = {
  user: User | undefined
  networks: Network[]
  l1Network: Network | undefined
  contracts: Contracts | undefined
  tokens: Token[]
  events: Events | undefined
  accountDetails: AccountDetails | undefined
  txHistory: TxHistory | undefined
  txConfirm: TxConfirm | undefined
}

const AppContext = createContext<AppContextProps>({
  user: undefined,
  networks: [],
  l1Network: undefined,
  contracts: undefined,
  tokens: [],
  events: undefined,
  accountDetails: undefined,
  txHistory: undefined,
  txConfirm: undefined
})

const AppContextProvider: FC = ({ children }) => {
  //logger.debug('AppContextProvider render')
  const { provider } = useWeb3Context()

  const user = useMemo(() => {
    if (!provider) {
      return undefined
    }

    return new User(provider)
  }, [provider])

  const networks = useNetworks()
  const tokens = useTokens(networks)
  const contracts = useContracts(networks, tokens)
  const events = useEvents()
  const txHistory = useTxHistory()
  const accountDetails = useAccountDetails()
  const txConfirm = useTxConfirm()
  const l1Network = networks?.[0]

  return (
    <AppContext.Provider
      value={{
        user,
        networks,
        l1Network,
        contracts,
        tokens,
        events,
        txHistory,
        accountDetails,
        txConfirm
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)

export default AppContextProvider
