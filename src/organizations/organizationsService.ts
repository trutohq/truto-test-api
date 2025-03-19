import { BaseService } from '../services/baseService';
import { Organization } from '../types';

type CreateOrganization = {
  name: string;
  slug: string;
};

type UpdateOrganization = Partial<CreateOrganization>;

export class OrganizationsService extends BaseService<Organization> {
  protected tableName = 'organizations';
  protected idColumn = 'id';

  create(data: CreateOrganization): Promise<Organization> {
    return super.create(data);
  }

  update(id: number, data: UpdateOrganization): Promise<Organization | undefined> {
    return super.update(id, data);
  }
}