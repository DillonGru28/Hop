import makeRequest from './makeRequest'
import { DateTime } from 'luxon'
import { Filters, normalizeEntity } from './shared'
import { MaxInt32 } from 'src/constants'

export default async function getTransferIds (
  chain: string,
  token: string,
  filters: Partial<Filters> = {},
  lastId: string = '0x0000000000000000000000000000000000000000'
): Promise<any[]> {
  const query = `
    query TransfersSent(${token ? '$token: String, ' : ''}$orderDirection: String, $startDate: Int, $endDate: Int, $lastId: ID) {
      transferSents(
        where: {
          ${token ? 'token: $token,' : ''}
          timestamp_gte: $startDate,
          timestamp_lte: $endDate,
          id_gt: $lastId
        },
        orderBy: id,
        orderDirection: asc,
        first: 1000,
      ) {
        id
        transferId
        destinationChainId
        recipient
        amount
        transferNonce
        bonderFee
        index
        amountOutMin
        deadline

        transactionHash
        transactionIndex
        timestamp
        blockNumber
        contractAddress
        token
      }
    }
  `
  const variables = {
    token,
    startDate: 0,
    endDate: MaxInt32,
    lastId
  }
  if (filters.startDate) {
    variables.startDate = DateTime.fromISO(filters.startDate).toSeconds() >>> 0
  }
  if (filters.endDate) {
    variables.endDate = DateTime.fromISO(filters.endDate).toSeconds() >>> 0
  }
  const jsonRes = await makeRequest(chain, query, variables)
  let transfers = jsonRes.transferSents.map((x: any) => normalizeEntity(x))

  lastId = transfers[transfers.length - 1].id
  const maxItemsLength = 1000
  if (transfers.length === maxItemsLength) {
    transfers = transfers.concat(await getTransferIds(
      chain,
      token,
      filters,
      lastId
    ))
  }

  return transfers
}
