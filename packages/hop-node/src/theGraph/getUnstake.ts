import makeRequest from './makeRequest'
import { constants } from 'ethers'
import { normalizeEntity } from './shared'

export default async function getUnstake (
  chain: string,
  token: string,
  bonder: string,
  lastId: string = constants.AddressZero
) {
  bonder = bonder.toLowerCase()
  const query = `
    query Unstake($token: String, $bonder: String, $lastId: ID) {
      unstakes(
        where: {
          id_gt: $lastId
          account: $bonder
          token: $token
        },
        orderBy: id,
        orderDirection: asc,
        first: 1000
      ) {
        id
        amount
      }
    }
  `
  const jsonRes = await makeRequest(chain, query, {
    token,
    bonder,
    lastId: lastId
  })
  let unstakes = jsonRes.unstakes.map((x: any) => normalizeEntity(x))

  const maxItemsLength = 1000
  if (unstakes.length === maxItemsLength) {
    lastId = unstakes[unstakes.length - 1].id
    unstakes = unstakes.concat(await getUnstake(
      chain,
      token,
      bonder,
      lastId
    ))
  }

  return unstakes
}
