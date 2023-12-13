import logger from './logger.js'

const vaultAddr = process.env.VAULT_ADDR // Vault address
const token = process.env.VAULT_TOKEN // Vault token

const vault = require('node-vault')({
    apiVersion: 'v1',
    endpoint: vaultAddr,
    token
})

export default async function loadVaultSecrets () {
    if (process.env.NODE_ENV !== 'production') {
        logger.info('Env is not production, not loading secrets from vault')
        return
    }

    try {
        // Reading the keys in backend directory
        const vaultMetadata = await vault.list('secret/metadata/backend')

        // KEEP UPDATED:
        // Expected production env keys:
        // 'BETTERSTACK_LOG_TOKEN', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_HOST', 'SESSION_SECRET', 'CSRF_SECRET', 'EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS'
        const keys = vaultMetadata.data.keys

        logger.debug('Reading vault keys: ' + keys.toString())

        // Load all keys
        for (const key of keys) {
            const secretPath = `secret/data/backend/${key}`
            logger.debug('Fetching secret key at path: ' + secretPath)

            try {
                const response = await vault.read(secretPath)
                const secretValue = response.data.data[key]

                // Save the key-value pair to runtime env
                process.env[key] = secretValue

                // Check if it is saved successfully
                if (process.env[key] === secretValue) {
                    logger.debug('Saved to env: ' + key)
                } else {
                    logger.error('Failed to save to env: ' + key)
                }
            } catch (error: any) {
                logger.error(`Error fetching secret for ${key}: ${error.message}`)
            }
        }

        // Check if all required keys are loaded
        const missingKeys = []
        for (const key of keys) {
            if (!process.env[key]) {
                missingKeys.push(key)
            }
        }
        if (missingKeys.length != 0) {
            throw new Error('Keys failed to load to env: ' + missingKeys.toString())
        } else {
            logger.info('All secrets successfully loaded from vault!')
        }
    } catch (err) {
        logger.error(`Failed to load secrets: ${err}`)
        logger.error('Shutting down')
        process.exit(1)
    }
}
