/**
 * Configuration module for AINP MCP Bridge
 * Loads DID, private key, and broker URL from environment or config file
 */

import * as fs from 'fs';
import * as path from 'path';

export interface AINPConfig {
  baseUrl: string;
  did: string;
  privateKey: string;
  timeoutMs?: number;
  // Payment/wallet configuration
  walletAddress?: string; // Coinbase Commerce wallet address for payments
  coinbaseApiKey?: string; // Coinbase Commerce API key for payment requests
}

/**
 * Load configuration from environment variables or JSON file
 *
 * Environment variables (preferred):
 *   AINP_BASE_URL - Broker URL (default: http://localhost:8080)
 *   AINP_DID - Agent DID (required)
 *   AINP_PRIVATE_KEY - Ed25519 private key base64 (required)
 *   AINP_TIMEOUT_MS - Request timeout (default: 30000)
 *   AINP_WALLET_ADDRESS - Coinbase Commerce wallet address (optional)
 *   AINP_COINBASE_API_KEY - Coinbase Commerce API key (optional)
 *
 * JSON file (fallback):
 *   ~/.ainp/mcp-config.json with same keys (camelCase)
 */
export function loadConfig(): AINPConfig {
  // Try environment variables first
  const baseUrl = process.env.AINP_BASE_URL || 'http://localhost:8080';
  const did = process.env.AINP_DID;
  const privateKey = process.env.AINP_PRIVATE_KEY;
  const timeoutMs = parseInt(process.env.AINP_TIMEOUT_MS || '30000', 10);
  const walletAddress = process.env.AINP_WALLET_ADDRESS;
  const coinbaseApiKey = process.env.AINP_COINBASE_API_KEY;

  if (did && privateKey) {
    return { baseUrl, did, privateKey, timeoutMs, walletAddress, coinbaseApiKey };
  }

  // Fallback to config file
  const configPath = path.join(process.env.HOME || '~', '.ainp', 'mcp-config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const json = JSON.parse(raw);
    return {
      baseUrl: json.baseUrl || baseUrl,
      did: json.did,
      privateKey: json.privateKey,
      timeoutMs: json.timeoutMs || timeoutMs,
      walletAddress: json.walletAddress,
      coinbaseApiKey: json.coinbaseApiKey,
    };
  }

  throw new Error(
    'AINP MCP Bridge configuration not found. ' +
    'Set AINP_DID and AINP_PRIVATE_KEY environment variables, ' +
    'or create ~/.ainp/mcp-config.json with { "did": "...", "privateKey": "..." }'
  );
}
