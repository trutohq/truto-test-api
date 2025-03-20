import { OrganizationsService } from '../organizations/organizationsService';
import { UsersService } from '../users/usersService';
import { ApiKeyService } from '../apiKeys/apiKeyService';
import db from '../config/database';

const organizationsService = new OrganizationsService(db);
const usersService = new UsersService(db);
const apiKeyService = new ApiKeyService(db);

async function createOrg() {
  // Get organization details from command line
  const orgName = process.argv[2];
  const orgSlug = process.argv[3];
  const userEmail = process.argv[4];
  const userName = process.argv[5];
  const userRole = process.argv[6] || 'admin';

  if (!orgName || !orgSlug || !userEmail || !userName) {
    console.error('Usage: bun run create-org <org-name> <org-slug> <user-email> <user-name> [user-role]');
    process.exit(1);
  }

  try {
    // Create organization
    const organization = await organizationsService.create({
      name: orgName,
      slug: orgSlug,
    });
    console.log('Created organization:', organization);

    // Create user
    const user = await usersService.create({
      email: userEmail,
      name: userName,
      organization_id: organization.id,
      role: userRole as 'admin' | 'agent',
    });
    console.log('Created user:', user);

    // Create API key
    try {
      const apiKey = await apiKeyService.createForUser(user.id);
      console.log('API key created:', apiKey.key);
    } catch (error) {
      console.error('Failed to create API key:', error);
      process.exit(1);
    }

    console.log('\nSetup completed successfully!');
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

createOrg(); 