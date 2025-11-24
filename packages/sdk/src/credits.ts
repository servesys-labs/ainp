/**
 * AINP Credit Management
 * Track and validate credit budgets
 * Spec: RFC 001-SPEC Section 3.1.3
 */

import { InsufficientCreditsError } from './errors.js';
import { Logger } from './logger.js';

const logger = new Logger({ serviceName: 'ainp-credits' });

export interface CreditAccount {
  balance: number;
  reserved: number;
  earned: number;
}

export class CreditManager {
  private account: CreditAccount = {
    balance: 0,
    reserved: 0,
    earned: 0,
  };

  constructor(initialBalance: number = 0) {
    this.account.balance = initialBalance;
    logger.debug('Credit manager initialized', { initialBalance });
  }

  /**
   * Get current account state
   */
  getAccount(): CreditAccount {
    return { ...this.account };
  }

  /**
   * Get available balance (balance - reserved)
   */
  getAvailable(): number {
    return this.account.balance - this.account.reserved;
  }

  /**
   * Reserve credits for an intent
   * @param amount - Credits to reserve
   * @throws InsufficientCreditsError if balance is too low
   */
  reserve(amount: number): void {
    const available = this.getAvailable();

    if (available < amount) {
      logger.error('Insufficient credits', {
        requested: amount,
        available,
        balance: this.account.balance,
        reserved: this.account.reserved,
      });
      throw new InsufficientCreditsError(
        `Insufficient credits: ${available} available, ${amount} required`
      );
    }

    this.account.reserved += amount;

    logger.debug('Credits reserved', {
      amount,
      reserved: this.account.reserved,
      available: this.getAvailable(),
    });
  }

  /**
   * Release reserved credits (intent completed or failed)
   * @param amount - Credits to release
   * @param spent - Credits actually spent (deducted from balance)
   */
  release(amount: number, spent: number = 0): void {
    this.account.reserved -= amount;
    this.account.balance -= spent;

    logger.debug('Credits released', {
      released: amount,
      spent,
      balance: this.account.balance,
      reserved: this.account.reserved,
    });
  }

  /**
   * Add credits to balance (payment, reward, etc.)
   * @param amount - Credits to add
   */
  deposit(amount: number): void {
    this.account.balance += amount;

    logger.debug('Credits deposited', {
      amount,
      balance: this.account.balance,
    });
  }

  /**
   * Record credits earned from processing intents
   * @param amount - Credits earned
   */
  earn(amount: number): void {
    this.account.balance += amount;
    this.account.earned += amount;

    logger.debug('Credits earned', {
      amount,
      balance: this.account.balance,
      totalEarned: this.account.earned,
    });
  }

  /**
   * Validate credit budget for an intent
   * @param maxCredits - Maximum credits allowed
   * @param bid - Credit bid for priority
   * @returns true if valid
   */
  validateBudget(maxCredits: number, bid: number): boolean {
    const available = this.getAvailable();

    if (maxCredits < bid) {
      logger.warn('Invalid budget: bid exceeds max credits', {
        maxCredits,
        bid,
      });
      return false;
    }

    if (available < maxCredits) {
      logger.warn('Invalid budget: insufficient balance', {
        maxCredits,
        available,
      });
      return false;
    }

    return true;
  }
}
