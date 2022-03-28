import React from 'react'
import styled from 'styled-components'
import { useTable, useSortBy, sortTypes } from 'react-table'
import makeData from './makeData'
import { Div } from '../ui'
import { Loading } from '../Loading'

const Styles = styled.div`
  padding: 0.25rem;

  table {
    border-spacing: 0;
    border-radius: 8px;
    min-width: 85vw;

    @media screen and (min-width: 600px) {
      min-width: 70vw;
    }

    @media screen and (min-width: 960px) {
      min-width: 500px;
    }

    @media screen and (min-width: 1280px) {
      min-width: auto;
    }

    tr {
      transition: background 0.15s ease-out;
      :last-child {
        td {
          border-bottom: 0;
        }
      }
    }

    tbody {
      > tr {
        :first-child {
          background-color: transparent;
        }
        :nth-child(odd) {
          background-color: ${({ theme }) => theme.colors.background.contrast};
        }

        &:hover {
          background-color: ${({ theme }) => theme.colors.action.hover};
          color: black;
        }
      }
    }

    th,
    td {
      transition: background 0.15s ease-out;
      margin: 0;
      padding: 0.5rem;
      border-bottom: 1px solid #dbdbdb;

      :last-child {
        border-right: 0;
      }
    }
  }
`

function Table({ columns, data, loading }) {
  const {
    getTableProps,
    getTableBodyProps,
    headerGroups,
    rows,
    prepareRow,
    state,
    setHiddenColumns,
    ...rest
  } = useTable(
    {
      columns,
      data,
      sortTypes,
    },
    useSortBy
  )

  return (
    <Div>
      <table {...getTableProps()}>
        <thead>
          {headerGroups.map((headerGroup, i) => (
            <tr
              {...headerGroup.getHeaderGroupProps([
                {
                  style: {
                    ...headerGroup.style,
                    textAlign: i === 0 && 'left',
                    fontSize: i === 0 && '2rem',
                    color: i === 0 && '#B32EFF',
                  },
                },
              ])}
            >
              {headerGroup.headers.map((column, i) => (
                // Add the sorting props to control sorting. For this example
                // we can add them into the header props
                <th
                  {...column.getHeaderProps([
                    {
                      style: {
                        ...column.style,
                        backgroundColor: column.isSorted ? '#eed0ff' : 'transparent',
                      },
                    },
                    column.getSortByToggleProps(),
                  ])}
                >
                  {column.render('Header')}
                  <span style={{ color: '#B32EFF' }}>
                    {column.isSorted ? (column.isSortedDesc ? ' ↑' : ' ↓') : ''}
                  </span>
                </th>
              ))}
            </tr>
          ))}
        </thead>

        <tbody {...getTableBodyProps()}>
          {/* {loading ? (<Loading />) : rows.map((row, i) => {
            prepareRow(row)
            return (
              <tr {...row.getRowProps()}>
                {row.cells.map(cell => {
                  return <td {...cell.getCellProps()}>{cell.render('Cell')}</td>
                })}
              </tr>
            )
          })} */}
          {rows.map((row, i) => {
            prepareRow(row)
            return (
              <tr {...row.getRowProps()}>
                {row.cells.map(cell => {
                  return <td {...cell.getCellProps()}>{cell.render('Cell')}</td>
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </Div>
  )
}

interface Props {
  stats: any
  columns: any[]
  populateDataFn: (item: any, ...rest: any) => void
  extraData?: any
  loading?: boolean
}

function SortableTable(props: Props) {
  const { stats, columns, populateDataFn, extraData, loading } = props

  const data = React.useMemo(
    () => makeData(stats, populateDataFn, extraData),
    [stats, extraData, populateDataFn, loading]
  )

  return (
    <Styles>
      <Table columns={columns} data={data} loading={loading} />
    </Styles>
  )
}

export { SortableTable }
