import React from 'react'
import { Div, Flex, Icon } from 'src/components/ui'
import Box from '@material-ui/core/Box'
import Typography from '@material-ui/core/Typography'
import { Text } from 'src/components/ui/Text'
import Button from 'src/components/buttons/Button'
import hopTokenLogo from 'src/assets/logos/hop-token-logo.svg'
import { toTokenDisplay } from 'src/utils'
import { BigNumber } from 'ethers'
import { TokenClaim } from './useClaim'

interface ClaimTokensProps {
  claim?: TokenClaim
  claimableTokens: BigNumber
  warning?: string
  nextStep?: () => void
  setStep?: (step: number) => void
  isDarkMode: boolean
}

export function ClaimTokens(props: ClaimTokensProps) {
  const { claimableTokens, nextStep, isDarkMode } = props

  return (
    <>
      <Flex column>
        <Box mt={3}>
          <Typography variant="body1">
            You are eligible for the airdrop! View your tokens below and start the claim process.
          </Typography>
        </Box>
        {!claimableTokens.eq(0) && (
          <Div
            my={4}
            p={3}
            px={24}
            width="100%"
            boxShadow="mutedDark"
            bg={isDarkMode ? `black.muted` : 'white'}
            borderRadius="30px"
          >
            <Text mb={2} textAlign="left" color="text.primary">
              You will receive
            </Text>
            <Flex alignCenter width="100%">
              <Text fontSize={28} mr={2} mono textAlign="left" color="text.primary">
                {toTokenDisplay(claimableTokens || '0', 18)}
              </Text>

              <Icon src={hopTokenLogo} alt="HOP Token Logo" />
            </Flex>
          </Div>
        )}
      </Flex>

      <Flex column my={2}>
        {!claimableTokens.eq(0) && (
          <Box mb={3}>
            <Typography variant="body1">
              You have received these tokens for being an early participant of the Hop community. Use
              this responsibility wisely!
            </Typography>
          </Box>
        )}

        <Flex mt={2} justifyCenter fullWidth>
          {/* <Button large highlighted onClick={() => setStep(2)} disabled={claimableTokens.eq(0)}> */}
          <Button large highlighted onClick={nextStep} disabled={claimableTokens.eq(0)}>
            <Div width="220px">Start Claim</Div>
          </Button>
        </Flex>
      </Flex>
    </>
  )
}
