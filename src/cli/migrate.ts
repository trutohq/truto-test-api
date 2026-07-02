import { runMigrations } from '../config/migrations'

console.log('Running database migrations...')
runMigrations()
console.log('Migrations completed successfully.')
