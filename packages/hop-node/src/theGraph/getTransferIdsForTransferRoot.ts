import MerkleTree from 'src/utils/MerkleTree'
import makeRequest from './makeRequest'

export default async function getTransferIdsForTransferRoot (
  chain: string,
  rootHash: string
): Promise<string[]> {
  // get commit transfer event of root hash
  let query = `
    query TransferCommitteds($rootHash: String) {
      transfersCommitteds(
        where: {
          rootHash: $rootHash
        },
        orderBy: timestamp,
        orderDirection: asc,
        first: 1
      ) {
        id
        rootHash
        destinationChainId
        transactionHash
        timestamp
        blockNumber
      }
    }
  `
  let jsonRes = await makeRequest(chain, query, {
    rootHash
  })
  const transferCommitted = jsonRes.transfersCommitteds?.[0]
  if (!transferCommitted) {
    throw new Error('transfer committed event not found for root hash')
  }

  const destinationChainId = transferCommitted.destinationChainId

  // get the previous commit transfer event
  query = `
    query TransferCommitteds($blockNumber: String, $destinationChainId: String) {
      transfersCommitteds(
        where: {
          blockNumber_lt: $blockNumber,
          destinationChainId: $destinationChainId,
        },
        orderBy: blockNumber,
        orderDirection: desc,
        first: 1,
      ) {
        id
        rootHash
        transactionHash
        timestamp
        blockNumber
      }
    }
  `
  jsonRes = await makeRequest(chain, query, {
    blockNumber: transferCommitted.blockNumber,
    destinationChainId
  })
  const previousTransferCommitted = jsonRes.transfersCommitteds?.[0]
  if (!previousTransferCommitted) {
    throw new Error('previous transfer committed event not found')
  }

  // get the transfer sent events between the two commit transfer events
  const startBlockNumber = previousTransferCommitted.blockNumber
  const endBlockNumber = transferCommitted.blockNumber
  query = `
    query TransfersSent($startBlockNumber: String, $endBlockNumber: String, $destinationChainId: String) {
      transferSents(
        where: {
          blockNumber_gte: $startBlockNumber,
          blockNumber_lte: $endBlockNumber,
          destinationChainId: $destinationChainId
        },
        orderBy: blockNumber,
        orderDirection: asc,
        first: 1000,
      ) {
        id
        transferId
        transactionHash
        index
        timestamp
        blockNumber
      }
    }
  `
  jsonRes = await makeRequest(chain, query, {
    startBlockNumber,
    endBlockNumber,
    destinationChainId
  })

  // normalize fields
  let transferIds = jsonRes.transferSents.map((x: any) => {
    x.blockNumber = Number(x.blockNumber)
    x.index = Number(x.index)
    return x
  })

  // sort by transfer id block number and index
  transferIds = transferIds.sort((a: any, b: any) => {
    if (a.index > b.index) return 1
    if (a.index < b.index) return -1
    if (a.blockNumber > b.blockNumber) return 1
    if (a.blockNumber < b.blockNumber) return -1
    return 0
  })

  const seen: { [key: string]: boolean } = {}

  // remove any transfer id after a second index of 0,
  // which occurs if commit transfers is triggered on a transfer sent
  transferIds = transferIds.filter((x: any, i: number) => {
    if (seen[x.index]) {
      return false
    }
    seen[x.index] = true
    return true
  })
    .filter((x: any, i: number) => {
    // filter out any transfers ids after sequence breaks
      return x.index === i
    })

  // return only transfer ids
  transferIds = transferIds.map((x: any) => {
    return x.transferId
  })

  // verify that the computed root matches the original root hash
  const tree = new MerkleTree(transferIds)
  if (tree.getHexRoot() !== rootHash) {
    throw new Error('computed transfer root hash does not match')
  }

  return transferIds
}
