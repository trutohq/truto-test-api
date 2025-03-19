import { UsersService } from '../users/usersService';
import { ApiKeyService } from '../apiKeys/apiKeyService';

async function createApiKey() {
  const usersService = new UsersService();
  const apiKeyService = new ApiKeyService();

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
    const apiKey = await apiKeyService.create(user.id);
    console.log('\nAPI Key:', apiKey.key);
    console.log('\nAPI key created successfully!');
  } catch (error) {
    console.error('Failed to create API key:', error);
    process.exit(1);
  }
}

createApiKey(); 