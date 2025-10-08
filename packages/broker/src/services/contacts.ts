/**
 * ContactService - Consent and allowlist management
 * Tracks peer relationships for anti-fraud bypass and contact management
 */

import { DatabaseClient } from '../lib/db-client';

export type ConsentState = 'unknown' | 'consented' | 'blocked' | 'trusted';

export interface Contact {
  owner_did: string;
  peer_did: string;
  alias?: string;
  notes?: string;
  consent_state: ConsentState;
  allowlist: boolean;
  trust_override?: number;
  first_seen_at: Date;
  last_seen_at: Date;
  message_count: number;
  last_message_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export class ContactService {
  constructor(private db: DatabaseClient) {}

  /**
   * Record an interaction between two agents
   * Auto-creates contact if doesn't exist, updates stats if it does
   * @param ownerDid Agent DID
   * @param peerDid Peer agent DID
   */
  async recordInteraction(ownerDid: string, peerDid: string): Promise<void> {
    await this.db.query(
      `INSERT INTO contacts (owner_did, peer_did, consent_state, last_seen_at, message_count)
       VALUES ($1, $2, 'unknown', NOW(), 1)
       ON CONFLICT (owner_did, peer_did) DO UPDATE SET
         message_count = contacts.message_count + 1,
         last_seen_at = GREATEST(contacts.last_seen_at, NOW()),
         updated_at = NOW()`,
      [ownerDid, peerDid]
    );
  }

  /**
   * Set consent state for a peer
   * @param ownerDid Agent DID
   * @param peerDid Peer agent DID
   * @param state Consent state (unknown, consented, blocked, trusted)
   */
  async setConsent(ownerDid: string, peerDid: string, state: ConsentState): Promise<void> {
    await this.db.query(
      `INSERT INTO contacts (owner_did, peer_did, consent_state)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner_did, peer_did) DO UPDATE SET
         consent_state = $3,
         updated_at = NOW()`,
      [ownerDid, peerDid, state]
    );
  }

  /**
   * Check if a peer is consented (for anti-fraud bypass)
   * Returns true if consent_state is 'consented' or 'trusted', or allowlist is true
   * @param ownerDid Agent DID
   * @param peerDid Peer agent DID
   * @returns True if peer is consented/allowlisted
   */
  async isConsented(ownerDid: string, peerDid: string): Promise<boolean> {
    const result = await this.db.query(
      `SELECT consent_state, allowlist
       FROM contacts
       WHERE owner_did = $1 AND peer_did = $2`,
      [ownerDid, peerDid]
    );

    if (result.rows.length === 0) {
      return false; // No contact entry = not consented
    }

    const contact = result.rows[0];
    return (
      contact.allowlist === true ||
      contact.consent_state === 'consented' ||
      contact.consent_state === 'trusted'
    );
  }

  /**
   * Add a peer to allowlist (bypass greylist and postage)
   * @param ownerDid Agent DID
   * @param peerDid Peer agent DID
   * @param allowlisted True to add to allowlist, false to remove
   */
  async setAllowlist(ownerDid: string, peerDid: string, allowlisted: boolean): Promise<void> {
    await this.db.query(
      `INSERT INTO contacts (owner_did, peer_did, allowlist, consent_state)
       VALUES ($1, $2, $3, 'consented')
       ON CONFLICT (owner_did, peer_did) DO UPDATE SET
         allowlist = $3,
         updated_at = NOW()`,
      [ownerDid, peerDid, allowlisted]
    );
  }

  /**
   * Get all contacts for an agent
   * @param ownerDid Agent DID
   * @param filter Optional filter (e.g., only allowlisted, only blocked)
   * @returns List of contacts
   */
  async getContacts(
    ownerDid: string,
    filter?: { allowlist?: boolean; consent_state?: ConsentState }
  ): Promise<Contact[]> {
    let sql = `
      SELECT owner_did, peer_did, alias, notes,
             consent_state, allowlist, trust_override,
             first_seen_at, last_seen_at, message_count, last_message_at,
             created_at, updated_at
      FROM contacts
      WHERE owner_did = $1
    `;

    const params: any[] = [ownerDid];
    let paramIndex = 2;

    if (filter?.allowlist !== undefined) {
      sql += ` AND allowlist = $${paramIndex}`;
      params.push(filter.allowlist);
      paramIndex++;
    }

    if (filter?.consent_state) {
      sql += ` AND consent_state = $${paramIndex}`;
      params.push(filter.consent_state);
      paramIndex++;
    }

    sql += ` ORDER BY last_seen_at DESC`;

    const result = await this.db.query(sql, params);
    return result.rows;
  }

  /**
   * Get a specific contact
   * @param ownerDid Agent DID
   * @param peerDid Peer agent DID
   * @returns Contact or null if not found
   */
  async getContact(ownerDid: string, peerDid: string): Promise<Contact | null> {
    const result = await this.db.query(
      `SELECT owner_did, peer_did, alias, notes,
              consent_state, allowlist, trust_override,
              first_seen_at, last_seen_at, message_count, last_message_at,
              created_at, updated_at
       FROM contacts
       WHERE owner_did = $1 AND peer_did = $2`,
      [ownerDid, peerDid]
    );

    return result.rows[0] || null;
  }

  /**
   * Update contact metadata (alias, notes)
   * @param ownerDid Agent DID
   * @param peerDid Peer agent DID
   * @param updates Fields to update
   */
  async updateContact(
    ownerDid: string,
    peerDid: string,
    updates: { alias?: string; notes?: string; trust_override?: number }
  ): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [ownerDid, peerDid];
    let paramIndex = 3;

    if (updates.alias !== undefined) {
      sets.push(`alias = $${paramIndex}`);
      params.push(updates.alias);
      paramIndex++;
    }

    if (updates.notes !== undefined) {
      sets.push(`notes = $${paramIndex}`);
      params.push(updates.notes);
      paramIndex++;
    }

    if (updates.trust_override !== undefined) {
      sets.push(`trust_override = $${paramIndex}`);
      params.push(updates.trust_override);
      paramIndex++;
    }

    if (sets.length === 0) {
      return; // No updates
    }

    sets.push('updated_at = NOW()');

    await this.db.query(
      `UPDATE contacts SET ${sets.join(', ')} WHERE owner_did = $1 AND peer_did = $2`,
      params
    );
  }

  /**
   * Block a peer (set consent_state to 'blocked')
   * @param ownerDid Agent DID
   * @param peerDid Peer agent DID
   */
  async blockPeer(ownerDid: string, peerDid: string): Promise<void> {
    await this.setConsent(ownerDid, peerDid, 'blocked');
  }

  /**
   * Unblock a peer (set consent_state to 'unknown')
   * @param ownerDid Agent DID
   * @param peerDid Peer agent DID
   */
  async unblockPeer(ownerDid: string, peerDid: string): Promise<void> {
    await this.setConsent(ownerDid, peerDid, 'unknown');
  }
}
