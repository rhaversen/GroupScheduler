// Node.js built-in modules
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

// Third-party libraries
import dotenv from 'dotenv'
import { createLogger, format as _format, transports as _transports } from 'winston'

// Setup
dotenv.config()

// Global variables
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const logger = createLogger({
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        verbose: 4,
        debug: 5,
        silly: 6
    },
    format: _format.combine(
        _format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:SSS' }),
        _format.json(), // Use JSON format for logs
        _format.printf((logObject) => {
            return `${logObject.timestamp} ${logObject.level}: ${logObject.message}`
        })
    ),
    defaultMeta: { service: 'group-scheduler' }, // Set a default metadata field
    transports: [
        new _transports.File({ filename: join(__dirname, '../logs/error.log'), level: 'error' }),
        new _transports.File({ filename: join(__dirname, '../logs/combined.log') })
    ]
})

// If you want to log to the console in addition to files during development, you can add the following code:
if (process.env.NODE_ENV === 'development') {
    logger.add(
        new _transports.Console({
            format: _format.combine(
                _format.colorize(),
                _format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
                _format.printf((logObject) => {
                    return `${logObject.timestamp} ${logObject.level}: ${logObject.message}`
                })
            )
        })
    )
}

export default logger
