const fs = require('node:fs')
const path = require('node:path')

const distDir = path.resolve(__dirname, '..', 'dist')
const entryPath = path.join(distDir, 'server.js')
const target = './backend/src/server.js'

fs.mkdirSync(distDir, { recursive: true })
fs.writeFileSync(entryPath, `require('${target}')\n`)
