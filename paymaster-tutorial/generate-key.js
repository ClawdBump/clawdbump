// Helper script to generate a new private key
import crypto from 'crypto'

const privateKey = '0x' + crypto.randomBytes(32).toString('hex')
console.log('Generated Private Key:')
console.log(privateKey)
console.log('\n⚠️  WARNING: Keep this private key secure!')
console.log('⚠️  DO NOT commit this to version control!')
console.log('\nCopy this key and update config.js with it.')









