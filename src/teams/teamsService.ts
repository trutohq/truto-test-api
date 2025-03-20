import { BaseService } from '../services/baseService';
import { Team, User, PaginatedResponse } from '../types';
import { createPaginatedResponse, decodeCursor } from '../utils';

type CreateTeam = {
  name: string;
  organization_id: number;
};

type UpdateTeam = Partial<CreateTeam>;

type ListTeamsOptions = {
  cursor?: string;
  limit?: number;
  organization_id?: number;
};

export class TeamsService extends BaseService<Team> {
  protected tableName = 'teams';
  protected idColumn = 'id';

  create(data: CreateTeam): Promise<Team> {
    return super.create(data);
  }

  update(id: number, data: UpdateTeam): Promise<Team | undefined> {
    return super.update(id, data);
  }

  async getById(id: number): Promise<Team | undefined> {
    const row = this.query(`
      SELECT t.*, 
        json_group_array(
          json_object(
            'id', u.id,
            'email', u.email,
            'name', u.name,
            'role', u.role,
            'organization_id', u.organization_id,
            'created_at', u.created_at,
            'updated_at', u.updated_at
          )
        ) as members
      FROM teams t
      LEFT JOIN team_members tm ON t.id = tm.team_id
      LEFT JOIN users u ON tm.user_id = u.id
      WHERE t.${this.idColumn} = ?
      GROUP BY t.id
    `).get(id);

    if (!row) return undefined;

    // Parse members and filter out null entries (when team has no members)
    const team = this.parseJsonFields<Team>(row, ['members']);
    if (team) {
      team.members = team.members.filter((member: any) => member.id !== null);
    }
    return team;
  }

  async list({ cursor, limit = 10, organization_id }: ListTeamsOptions = {}): Promise<PaginatedResponse<Team>> {
    const cursorData = cursor ? decodeCursor(cursor) : null;
    const conditions: string[] = [];
    const params: any[] = [];

    if (cursorData) {
      conditions.push(`t.${this.idColumn} > ?`);
      params.push(cursorData.id);
    }

    if (organization_id) {
      conditions.push('t.organization_id = ?');
      params.push(organization_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit + 1);
    
    const rows = this.query(`
      SELECT t.*, 
        json_group_array(
          json_object(
            'id', u.id,
            'email', u.email,
            'name', u.name,
            'role', u.role,
            'organization_id', u.organization_id,
            'created_at', u.created_at,
            'updated_at', u.updated_at
          )
        ) as members
      FROM teams t
      LEFT JOIN team_members tm ON t.id = tm.team_id
      LEFT JOIN users u ON tm.user_id = u.id
      ${whereClause}
      GROUP BY t.id
      ORDER BY t.${this.idColumn}
      LIMIT ?
    `).all(...params);
    
    const items = rows.map(row => {
      const team = this.parseJsonFields<Team>(row, ['members']);
      if (team) {
        team.members = team.members.filter((member: any) => member.id !== null);
      }
      return team;
    });

    return createPaginatedResponse(items, limit, cursor);
  }

  async addMember(teamId: number, userId: number): Promise<boolean> {
    try {
      this.query(`
        INSERT INTO team_members (team_id, user_id)
        VALUES (?, ?)
      `).run(teamId, userId);
      return true;
    } catch (error) {
      return false;
    }
  }

  async removeMember(teamId: number, userId: number): Promise<boolean> {
    const result = this.query(`
      DELETE FROM team_members
      WHERE team_id = ? AND user_id = ?
    `).run(teamId, userId);

    return result.changes > 0;
  }

  async getTeamsByUserId(userId: number): Promise<Team[]> {
    const rows = this.query(`
      SELECT t.*, 
        json_group_array(
          json_object(
            'id', u.id,
            'email', u.email,
            'name', u.name,
            'role', u.role,
            'organization_id', u.organization_id,
            'created_at', u.created_at,
            'updated_at', u.updated_at
          )
        ) as members
      FROM teams t
      LEFT JOIN team_members tm ON t.id = tm.team_id
      LEFT JOIN users u ON tm.user_id = u.id
      WHERE EXISTS (
        SELECT 1 FROM team_members
        WHERE team_id = t.id AND user_id = ?
      )
      GROUP BY t.id
    `).all(userId);

    return rows.map(row => {
      const team = this.parseJsonFields<Team>(row, ['members']);
      if (team) {
        team.members = team.members.filter((member: any) => member.id !== null);
      }
      return team;
    });
  }
} 