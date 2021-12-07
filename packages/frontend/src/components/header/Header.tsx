import React, { FC, useState, useEffect } from 'react'
import { Theme, makeStyles, IconButton } from '@material-ui/core'
import Box from '@material-ui/core/Box'
import { useApp } from 'src/contexts/AppContext'
import { useWeb3Context } from 'src/contexts/Web3Context'
import HeaderRoutes from 'src/components/header/HeaderRoutes'
import TxPill from 'src/components/header/TxPill'
import HopLogoBlack from 'src/assets/logos/hop-logo-black.svg'
import HopLogoWhite from 'src/assets/logos/hop-logo-white.svg'
import { isMainnet } from 'src/config'
import Settings from 'src/pages/Send/Settings'
import WalletWarning from './WalletWarning'
import { toTokenDisplay, networkIdNativeTokenSymbol, networkIdToSlug } from 'src/utils'
import { findNetworkBySlug } from 'src/utils/networks'
import Network from 'src/models/Network'
import logger from 'src/logger'
import { useInterval } from 'src/hooks'
import ConnectWalletButton from './ConnectWalletButton'
import { isDarkMode } from 'src/theme/theme'
import SunIcon from 'src/assets/sun-icon.svg'
import MoonIcon from 'src/assets/moon-icon.svg'
import { Div, Icon } from '../ui'
import { useThemeMode } from 'src/theme/ThemeProvider'

const useStyles = makeStyles((theme: Theme) => ({
  root: {
    minHeight: '8rem',
    padding: '0 4.2rem',
    [theme.breakpoints.down('xs')]: {
      flexDirection: 'column',
      paddingTop: '2rem',
      marginBottom: '4rem',
    },
  },
  hopLogo: {
    width: '8.2rem',
  },
  label: {
    fontSize: '1rem',
    position: 'absolute',
    bottom: '-0.2rem',
    right: '0',
    opacity: '0.2',
  },
  balancePill: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'column',
    borderRadius: '3rem',
    marginRight: '1rem',
    padding: '0.4rem 2rem',
    boxShadow: isDarkMode(theme)
      ? theme.boxShadow.inner
      : `rgba(255, 255, 255, 0.5) -3px -3px 6px inset, rgba(174, 174, 192, 0.16) 3px 3px 6px inset`,
    color: theme.palette.text.secondary,
  },
  balance: {
    fontWeight: 'bold',
    fontSize: '1.5rem',
    whiteSpace: 'nowrap',
  },
  network: {
    fontSize: '1.4rem',
    display: 'flex',
    justifyContent: 'center',
    alignContent: 'center',
  },
  image: {
    marginRight: '0.5rem',
    width: '16px',
  },
}))

const Header: FC = () => {
  const styles = useStyles()
  const { address, provider, connectedNetworkId } = useWeb3Context()
  const { l1Network, networks, theme } = useApp()
  const [displayBalance, setDisplayBalance] = useState<string>('')
  const [connectedNetwork, setConnectedNetwork] = useState<Network | undefined>()

  const updateDisplayBalance = async () => {
    try {
      if (!(address && provider && connectedNetworkId)) {
        setDisplayBalance('')
        return
      }
      const balance = await provider.getBalance(address.address)
      const formattedBalance = toTokenDisplay(balance, 18)
      const tokenSymbol = networkIdNativeTokenSymbol(connectedNetworkId)
      const _displayBalance = `${formattedBalance} ${tokenSymbol}`
      const network = findNetworkBySlug(networks, networkIdToSlug(connectedNetworkId))
      setDisplayBalance(_displayBalance)
      setConnectedNetwork(network)
    } catch (err) {
      logger.error(err)
      setDisplayBalance('')
    }
  }

  useEffect(() => {
    updateDisplayBalance().catch(logger.error)
  }, [address, provider, connectedNetworkId])

  useInterval(() => {
    updateDisplayBalance().catch(logger.error)
  }, 5 * 1000)

  const { toggleMode, mode } = useThemeMode()
  const showBalance = !!displayBalance && !!connectedNetwork
  const ThemeModeIcon: any = isDarkMode(mode) ? SunIcon : MoonIcon

  return (
    <>
      <Box className={styles.root} display="flex" alignItems="center">
        <Box display="flex" flexDirection="row" flex={1} justifyContent="flex-start">
          <img
            className={styles.hopLogo}
            src={theme?.palette.type === 'dark' ? HopLogoWhite : HopLogoBlack}
            alt="Hop"
          />
          {!isMainnet ? <span className={styles.label}>{l1Network?.name}</span> : null}
        </Box>

        <Box display="flex" flexDirection="row" flex={1} justifyContent="center" alignSelf="center">
          <HeaderRoutes />
        </Box>

        <Box display="flex" flexDirection="row" flex={1} justifyContent="flex-end">
          <IconButton onClick={toggleMode}>
            <Div color="#666077" height="20px">
              <Icon src={ThemeModeIcon} width={20} />
            </Div>
          </IconButton>

          <Settings />
          {showBalance && (
            <div className={styles.balancePill}>
              <div className={styles.balance}>{displayBalance}</div>
              <div className={styles.network}>
                <img className={styles.image} alt="" src={connectedNetwork?.imageUrl} />
                {connectedNetwork?.name}
              </div>
            </div>
          )}
          {address ? <TxPill /> : <ConnectWalletButton mode={theme?.palette.type} />}
        </Box>
      </Box>
      <WalletWarning />
    </>
  )
}

export default Header
