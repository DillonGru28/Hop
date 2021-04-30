import { useState, useRef, useEffect, useCallback } from 'react'
import { BigNumber } from 'ethers'
import { useApp } from 'src/contexts/AppContext'
import Token from 'src/models/Token'
import Network from 'src/models/Network'
import logger from 'src/logger'
import useInterval from 'src/hooks/useInterval'

const useBalance = (token: Token | undefined, network: Network | undefined) => {
  const { user } = useApp()
  const [balance, setBalance] = useState<BigNumber>()
  const [loading, setLoading] = useState(false)
  const currentToken = useRef<Token>()
  const currentNetwork = useRef<Network>()

  const getBalance = useCallback(() => {
    const _getBalance = async () => {
      if (user && token && network) {
        if (
          (currentNetwork.current && !network.eq(currentNetwork.current))
          || (currentToken.current && !token.eq(currentToken.current))
        ) {
          setLoading(true)
        }

        try {
          const _balance = await user.getBalance(token, network)
          setBalance(_balance)
        } catch (err) {
          setBalance(undefined)
          throw err
        }
      } else {
        setBalance(undefined)
      }

      setLoading(false)
      currentToken.current = token
      currentNetwork.current = network
    }

    _getBalance().catch(logger.error)
  }, [user, token, network])

  useEffect(() => {
    getBalance()
  }, [user, token, network])

  useInterval(() => {
    getBalance()
  }, 5e3)

  return { balance, loading }
}

export default useBalance
