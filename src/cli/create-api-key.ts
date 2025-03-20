import { UsersService } from '../users/usersService';
import { ApiKeyService } from '../apiKeys/apiKeyService';
import db from '../config/database';

const usersService = new UsersService(db);
const apiKeyService = new ApiKeyService(db);

async function createApiKey() {
  // Get user email from command line
  const userEmail = process.argv[2];

  if (!userEmail) {
    console.error('Usage: bun run create-api-key <user-email>');
    process.exit(1);
  }

  try {
    // Find user
    const user = await usersService.getByEmail(userEmail);
    if (!user) {
      console.error('User not found');
      process.exit(1);
    }

    // Create API key
    const apiKey = await apiKeyService.createForUser(user.id);
    console.log('API key created:', apiKey.key);
  } catch (error) {
    console.error('Failed to create API key:', error);
    process.exit(1);
  }
}

createApiKey(); 