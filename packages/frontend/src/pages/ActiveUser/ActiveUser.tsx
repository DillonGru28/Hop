import React, { useEffect, useState } from 'react'
import Box from '@material-ui/core/Box'
import Typography from '@material-ui/core/Typography'
import { DiscordLoginButton, TwitterLoginButton } from "react-social-login-buttons";

export function ActiveUser() {
  return (
    <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center">
      <Box m={2} textAlign="center">
        <Typography variant="subtitle1" component="div">
          Hop airdrop social verification
        </Typography>
      </Box>
      <Box marginBottom={4} m={3} maxWidth={500} textAlign="center">
        <Typography variant="subtitle2" color="textSecondary">
          Please login with Discord or Twitter to verify your eligibility for the <strong>Active User</strong> airdrop tokens
        </Typography>
      </Box>
      <Box>
        <Box m={4} maxWidth={250}>
          <DiscordLoginButton onClick={() => {
            window.location.href = "https://social-auth.hop.exchange/discord/oauth"
            }} />
        </Box>
        <Box m={4} maxWidth={250}>
          <TwitterLoginButton onClick={() => {
            window.location.href = "https://social-auth.hop.exchange/twitter/oauth"
            }} />
        </Box>
      </Box>
    </Box>
  )
}
