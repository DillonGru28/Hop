import React, {
  FC,
  ChangeEvent,
  useState,
  useEffect,
  useCallback,
  useRef
} from 'react'
import { utils as ethersUtils } from 'ethers'
import { makeStyles } from '@material-ui/core/styles'
import Card from '@material-ui/core/Card'
import Box from '@material-ui/core/Box'
import Grid from '@material-ui/core/Grid'
import CircularProgress from '@material-ui/core/CircularProgress'
import Typography from '@material-ui/core/Typography'
import MenuItem from '@material-ui/core/MenuItem'
import LargeTextField from 'src/components/LargeTextField'
import FlatSelect from 'src/components/selects/FlatSelect'
import Network from 'src/models/Network'
import Token from 'src/models/Token'
import { useApp } from 'src/contexts/AppContext'
import useInterval from 'src/hooks/useInterval'

const useStyles = makeStyles(theme => ({
  root: {
    width: '51.6rem',
    boxSizing: 'border-box',
    [theme.breakpoints.down('xs')]: {
      width: 'auto'
    }
  },
  topRow: {
    marginBottom: '1.8rem'
  },
  networkLabel: {
    marginLeft: theme.padding.extraLight,
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  networkIcon: {
    height: '3.6rem'
  },
  greyCircle: {
    padding: '1.8rem',
    borderRadius: '1.8rem',
    backgroundColor: '#C4C4C4'
  }
}))

type Props = {
  value: string
  label: string
  token?: Token
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void
  selectedNetwork?: Network
  networkOptions?: Network[]
  onNetworkChange?: (network?: Network) => void
  onBalanceChange?: (balance: number | null) => void
}

const AmountSelectorCard: FC<Props> = props => {
  const {
    value,
    label,
    token,
    onChange,
    selectedNetwork,
    networkOptions,
    onNetworkChange,
    onBalanceChange
  } = props
  const styles = useStyles()
  const { user } = useApp()

  const [balance, setBalance] = useState<string | null>(null)
  // request tracker so only latest request response is set
  const tracker = useRef<number>(0)

  useEffect(() => {
    if (onBalanceChange) {
      onBalanceChange(Number(balance))
    }
  }, [balance])

  const getBalance = useCallback(() => {
    const ctx = tracker.current
    const _getBalance = async () => {
      if (user && token && selectedNetwork) {
        const _balance = await user.getBalance(token, selectedNetwork)
        if (ctx === tracker.current) {
          setBalance(Number(ethersUtils.formatUnits(_balance, 18)).toFixed(2))
        }
      }
    }

    _getBalance()
  }, [user, token, selectedNetwork])

  useEffect(() => {
    // switching tabs will cause getBalance to be called with incorrect token
    // so we wait until there's no more switching to get balance
    tracker.current++
    setBalance(null)
    const t = setTimeout(() => {
      getBalance()
    }, 10)
    return () => {
      clearTimeout(t)
    }
  }, [selectedNetwork])

  useEffect(() => {
    getBalance()
  }, [getBalance, user, token, selectedNetwork, tracker.current])

  useInterval(() => {
    getBalance()
  }, 5e3)

  return (
    <Card className={styles.root}>
      <Box
        display="flex"
        flexDirection="row"
        justifyContent="space-between"
        className={styles.topRow}
      >
        <Typography variant="subtitle2" color="textSecondary">
          {label}
        </Typography>
        <Typography variant="subtitle2" color="textSecondary">
          Balance:{' '}
          {!user ? (
            '0.00'
          ) : balance === null ? (
            <CircularProgress size={12} />
          ) : (
            balance
          )}
        </Typography>
      </Box>
      <Grid container alignItems="center">
        <Grid item xs={6}>
          <FlatSelect
            value={selectedNetwork?.slug || 'default'}
            onChange={event => {
              const network = networkOptions?.find(
                _network => _network.slug === event.target.value
              )
              if (onNetworkChange) {
                onNetworkChange(network)
              }
            }}
          >
            {networkOptions && (
              <MenuItem value="default" key={'select-network'}>
                <Box display="flex" flexDirection="row" alignItems="center">
                  <div className={styles.greyCircle} />
                  <Typography
                    variant="subtitle2"
                    className={styles.networkLabel}
                  >
                    Select Network
                  </Typography>
                </Box>
              </MenuItem>
            )}
            {(networkOptions || [selectedNetwork])?.map(
              (network: Network | undefined, i: number) => (
                <MenuItem value={network?.slug} key={i}>
                  <Box display="flex" flexDirection="row" alignItems="center">
                    <img
                      src={network?.imageUrl}
                      className={styles.networkIcon}
                      alt={network?.name}
                    />
                    <Typography
                      variant="subtitle2"
                      className={styles.networkLabel}
                    >
                      {network?.name}
                    </Typography>
                  </Box>
                </MenuItem>
              )
            )}
          </FlatSelect>
        </Grid>
        <Grid item xs={6}>
          <LargeTextField
            value={value}
            onChange={onChange}
            placeholder="0.0"
            units={token?.symbol}
          />
        </Grid>
      </Grid>
    </Card>
  )
}

export default AmountSelectorCard
