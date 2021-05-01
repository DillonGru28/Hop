import { privateKey, governancePrivateKey } from './config'
import { User } from './helpers'
import { wait } from 'src/utils'
// @ts-ignore
import { ETHEREUM, XDAI, OPTIMISM, DAI, POLYGON } from 'src/constants'

const network = OPTIMISM
const token = 'USDC'

test(
  'addBonder',
  async () => {
    const newBonder = new User(privateKey)
    const gov = new User(governancePrivateKey)
    let isBonder = await newBonder.isBonder(network, token)
    console.log(privateKey, isBonder)
    expect(isBonder).toBe(false)
    const tx = await gov.addBonder(network, token, await newBonder.getAddress())
    console.log('tx hash:', tx.hash)
    const receipt = await tx.wait()
    expect(receipt.status).toBe(1)
    // wait for L2 to receive update
    // @ts-ignore
    if (network !== ETHEREUM) {
      await wait(60 * 1000)
    }
    isBonder = await newBonder.isBonder(network, token)
    expect(isBonder).toBe(true)
  },
  300 * 1000
)
