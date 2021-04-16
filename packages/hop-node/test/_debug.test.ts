import { Contract, Wallet, providers } from 'ethers'
import erc20Artifact from 'src/abi/ERC20.json'
import { privateKey } from './config'

test('debug', async () => {
  const provider = new providers.StaticJsonRpcProvider(
    'https://sokol.poa.network'
  )
  const wallet = new Wallet(privateKey, provider)
  const tokenAddress = '0x452AED3fdB2E83A1352624321629180aB1489Dd0'
  const token = new Contract(tokenAddress, erc20Artifact.abi, wallet)
  console.log(wallet.address)
  const balance = await token.balanceOf(wallet.address)
  console.log(balance.toString())
})
