import React, { useMemo, useState, useEffect } from 'react'
import Typography from '@material-ui/core/Typography'
import { CellWrapper, SortableTable } from 'src/components/Table'
import { DateTime } from 'luxon'
import { Div, Icon } from 'src/components/ui'
import { findNetworkBySlug } from 'src/utils'
import { getTokenImage } from 'src/utils/tokens'
import { CopyEthAddress } from 'src/components/ui/CopyEthAddress'

export const populateIncompleteSettlementStats = (item: any) => {
  const sourceChain = findNetworkBySlug(item.sourceChain)
  const destinationChain = findNetworkBySlug(item.destinationChain)
  const token = getTokenImage(item.token)

  return {
    timestamp: DateTime.fromSeconds(item.timestamp).toRelative(),
    sourceChain: sourceChain?.imageUrl,
    destinationChain: destinationChain?.imageUrl,
    token: token,
    totalAmount: Number(item.totalAmountFormatted).toFixed(2),
    diffAmount: Number(item.diffFormatted).toFixed(2),
    settlementEvents: item.settlementEvents,
    withdrewEvents: item.withdrewEvents,
    isConfirmed: `${item.isConfirmed}`,
  }
}

export const populateLowBonderBalances = (item: any) => {
  const token = getTokenImage(item.native.replace('X', ''))
  const bridge = getTokenImage(item.bridge)

  return {
    bridge: bridge,
    token: token,
    bonder: item.bonder,
    amount: item.amountFormatted
  }
}

function useData() {
  const [incompleteSettlements, setIncompleteSettlements] = useState<any>([])
  const [lowBonderBalances, setLowBonderBalances] = useState<any>([])
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [fetching, setFetching] = useState<boolean>(false)

  useEffect(() => {
    setFetching(true)
    const update = async () => {
      try {
        const url = 'https://assets.hop.exchange/mainnet/v1-health-check.json'
        const res = await fetch(url)
        const result = await res.json()
        console.log('result:', result)
        if (result?.timestamp) {
          setLastUpdated(DateTime.fromMillis(result.timestamp).toRelative() as string)
        }
        if (result?.data?.incompleteSettlements) {
          setIncompleteSettlements(result.data.incompleteSettlements)
        }
        if (result?.data?.lowBonderBalances) {
          setLowBonderBalances(result.data.lowBonderBalances)
        }
      } catch (err) {
        console.error(err)
      }
      setFetching(false)
    }
    update().catch(console.error)
  }, [])

  return {
    incompleteSettlements,
    lowBonderBalances,
    lastUpdated,
    fetching
  }
}

const Health = () => {
  const { incompleteSettlements, lowBonderBalances, lastUpdated, fetching } = useData()
  const cell = ({ cell }) => (
                <CellWrapper cell={cell}>
                  {cell.value}
                </CellWrapper>
              )
  const cellIcon = ({ cell }) => (
                <CellWrapper cell={cell}>
                  <Icon src={cell.value} />
                </CellWrapper>
              )
  const cellNumber = ({ cell }) => (
                <CellWrapper cell={cell} end>
                  {cell.value}
                </CellWrapper>
              )
  const cellAddress = ({ cell }) => (
                <CellWrapper cell={cell} end>
                  <CopyEthAddress value={cell.value} />
                </CellWrapper>
              )
  const incompleteSettlementsColumns = [{
    Header: 'Incomplete Settlements',
    columns: [
      {
        Header: 'Date',
        accessor: 'timestamp',
        Cell: cell,
      },
      {
        Header: 'Source',
        accessor: 'sourceChain',
        Cell: cellIcon,
      },
      {
        Header: 'Destination',
        accessor: 'destinationChain',
        Cell: cellIcon
      },
      {
        Header: 'Token',
        accessor: 'token',
        Cell: cellIcon,
      },
      {
        Header: 'Total Amount',
        accessor: 'totalAmount',
        Cell: cellNumber,
      },
      {
        Header: 'Diff Amount',
        accessor: 'diffAmount',
        Cell: cellNumber,
      },
      {
        Header: 'Settlement Events',
        accessor: 'settlementEvents',
        Cell: cell,
      },
      {
        Header: 'Withdrew Events',
        accessor: 'withdrewEvents',
        Cell: cell,
      },
      {
        Header: 'Confirmed',
        accessor: 'isConfirmed',
        Cell: cell,
      },
    ]
  }]

  const lowBonderBalancesColumns = [{
    Header: 'Low Bonder Balances',
    columns: [
      {
        Header: 'Bridge',
        accessor: 'bridge',
        Cell: cellIcon,
      },
      {
        Header: 'Bonder',
        accessor: 'bonder',
        Cell: cellAddress,
      },
      {
        Header: 'Token',
        accessor: 'token',
        Cell: cellIcon
      },
      {
        Header: 'Amount',
        accessor: 'amount',
        Cell: cellNumber,
      },
    ]
  }]

  return (
    <div>
      <Typography variant="body1">
        Last updated {lastUpdated || '-'}
      </Typography>
      <SortableTable
        stats={ incompleteSettlements }
        columns={ incompleteSettlementsColumns }
        populateDataFn={ populateIncompleteSettlementStats }
        loading={ fetching }
      />
      <SortableTable
        stats={ lowBonderBalances }
        columns={ lowBonderBalancesColumns }
        populateDataFn={ populateLowBonderBalances }
        loading={ fetching }
      />
    </div>
  )
}

export default Health
