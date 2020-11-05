import { CSSProperties } from 'react'
import createBreakpoints from '@material-ui/core/styles/createBreakpoints'
import { createMuiTheme } from '@material-ui/core/styles'
import { TypographyOptions } from '@material-ui/core/styles/createTypography'

import { SkeletonClassKey } from '@material-ui/lab/Skeleton'

declare module '@material-ui/core/styles/overrides' {
  export interface ComponentNameToClassKey {
    MuiSkeleton: SkeletonClassKey
  }
}

declare module '@material-ui/core/styles/createMuiTheme' {

  interface Theme {
    padding: {
      thick: CSSProperties['paddingTop'],
      default: CSSProperties['paddingTop'],
      light: CSSProperties['paddingTop'],
      extraLight: CSSProperties['paddingTop']
    }
  }

  // allow configuration using `createMuiTheme`
  interface ThemeOptions {
    padding?: {
      thick?: CSSProperties['paddingTop'],
      default?: CSSProperties['paddingTop'],
      light?: CSSProperties['paddingTop'],
      extraLight?: CSSProperties['paddingTop']
    }
  }
}

export const palette = {
  primary: {
    main: '#FFFFFF',
    dark: 'rgba(255,255,255,0.6)',
    contrastText: '#2D2D2D'
  },
  secondary: {
    main: '#092056',
    contrastText: '#2D2D2D'
  },
  paper: {
    main: '#F0F0F3'
  },
  orange: {
    main: '#ff4c2e',
    contrastText: '#FFFFFF'
  },
  background: {
    default: '#0F1343',
    paper: '#F6F7FB'
  },
  action: {
    active: '#00BD7B',
    hover: '#28C894',
    selected: '#00BD7B',
    disabled: '#46525C'
  },
  divider: 'rgba(163, 163, 164, 0.3)'
}

const typography: TypographyOptions = {
  fontFamily: [
    'Nunito',
    '-apple-system',
    'BlinkMacSystemFont',
    '"Segoe UI"',
    'Roboto',
    '"Helvetica Neue"',
    'Arial',
    'sans-serif',
    '"Apple Color Emoji"',
    '"Segoe UI Emoji"',
    '"Segoe UI Symbol"'
  ].join(','),
  h1: {
    fontSize: '8.2rem',
    fontWeight: 300
  },
  h2: {
    fontSize: '6.0rem',
    fontWeight: 300
  },
  h3: {
    fontSize: '4.1rem',
    fontWeight: 400
  },
  h4: {
    fontSize: '2.8rem',
    fontWeight: 700
  },
  h5: {
    fontSize: '2.4rem',
    fontWeight: 700
  },
  h6: {
    fontSize: '2.0rem',
    fontWeight: 700
  },
  subtitle1: {
    fontSize: '1.8rem',
    fontWeight: 700
  },
  subtitle2: {
    fontSize: '1.6rem',
    fontWeight: 700
  },
  body1: {
    fontSize: '1.4rem',
    fontWeight: 400
  },
  body2: {
    fontSize: '1.2rem',
    fontWeight: 400
  },
  button: {
    fontSize: '1.8rem',
    fontWeight: 700,
    textTransform: 'capitalize'
  }
}

const padding = {
  thick: '4.2rem',
  default: '2.8rem',
  light: '1.8rem',
  extraLight: '1.2rem'
}

const breakpoints = createBreakpoints({})

const theme = createMuiTheme({
  palette,
  padding,
  typography,
  breakpoints,
  overrides: {
    MuiCard: {
      root: {
        padding: '2.8rem',
        borderRadius: '3.0rem',
        backgroundColor: palette.paper.main,
        boxShadow: `
          -8px -8px 30px rgba(255, 255, 255, 0.95),
          8px 8px 30px rgba(174, 174, 192, 0.35),
          inset -8px -8px 12px rgba(255, 255, 255, 0.15),
          inset 8px 8px 8px rgba(174, 174, 192, 0.04);
        `
      }
    },
    MuiButton: {
      root: {
        margin: 'inherit',
        // color: 'inherit'
      },
      // disabled: {
      //   color: '#46525C'
      // }
    }
  }
})

export default theme
