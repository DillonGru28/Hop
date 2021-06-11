import { Tokens } from './types'
// import daiIcon from './assets/dai.svg'
// import arbIcon from './assets/arbitrum.svg'
// import sethIcon from './assets/seth.svg'
// import sbtcIcon from './assets/sbtc.svg'
// import usdcIcon from './assets/usdc.svg'
// import wbtcIcon from './assets/wbtc.svg'

export const tokens: Tokens = {
  DAI: {
    symbol: 'DAI',
    name: 'DAI Stablecoin',
    decimals: 18,
    image: ''
  },
  ARB: {
    symbol: 'ARB',
    name: 'ARB Token',
    decimals: 18,
    image: ''
  },
  sETH: {
    symbol: 'sETH',
    name: 'Synth ETH',
    decimals: 18,
    image: ''
  },
  sBTC: {
    symbol: 'sBTC',
    name: 'Synth BTC',
    decimals: 18,
    image: ''
  },
  USDC: {
    symbol: 'USDC',
    name: 'USDC',
    decimals: 6,
    image: ''
  },
  WBTC: {
    symbol: 'WBTC',
    name: 'Wrapped BTC',
    decimals: 18,
    image: ''
  }
}
