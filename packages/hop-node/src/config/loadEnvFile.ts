const path = require('path')
const fs = require('fs')
const argv = require('minimist')(process.argv.slice(2))

let opts: any = {}
if (typeof argv.env === 'string') {
  const envFile = path.resolve(argv.env)
  if (!fs.existsSync(envFile)) {
    console.error(`env file '${envFile}' does not exit`)
    process.exit(1)
  }

  opts.path = envFile
  console.log(`using environment variable file: ${opts.path}`)
}

require('dotenv').config(opts)
