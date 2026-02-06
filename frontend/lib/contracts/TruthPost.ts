import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { Claim, ReputationEntry, TransactionReceipt } from "./types";

/**
 * TruthPost contract class for interacting with the GenLayer fact-checking contract
 */
class TruthPost {
  private contractAddress: `0x${string}`;
  private client: ReturnType<typeof createClient>;

  constructor(
    contractAddress: string,
    address?: string | null,
    studioUrl?: string
  ) {
    this.contractAddress = contractAddress as `0x${string}`;

    const config: any = {
      chain: studionet,
    };

    if (address) {
      config.account = address as `0x${string}`;
    }

    if (studioUrl) {
      config.endpoint = studioUrl;
    }

    this.client = createClient(config);
  }

  /**
   * Update the address used for transactions
   */
  updateAccount(address: string): void {
    const config: any = {
      chain: studionet,
      account: address as `0x${string}`,
    };

    this.client = createClient(config);
  }

  /**
   * Get all claims from the contract
   * @returns Array of claims with their details
   */
  async getClaims(): Promise<Claim[]> {
    try {
      const claims: any = await this.client.readContract({
        address: this.contractAddress,
        functionName: "get_claims",
        args: [],
      });

      // Convert GenLayer Map structure to typed array
      if (claims instanceof Map) {
        return Array.from(claims.entries()).map(([id, claimData]: any) => {
          const obj =
            claimData instanceof Map
              ? Object.fromEntries(claimData.entries())
              : claimData;
          return { id, ...obj } as Claim;
        });
      }

      // Handle plain object response
      if (claims && typeof claims === "object") {
        return Object.entries(claims).map(([id, claimData]: any) => {
          const obj =
            claimData instanceof Map
              ? Object.fromEntries(claimData.entries())
              : claimData;
          return { id, ...obj } as Claim;
        });
      }

      return [];
    } catch (error) {
      console.error("Error fetching claims:", error);
      throw new Error("Failed to fetch claims from contract");
    }
  }

  /**
   * Get a specific claim by ID
   */
  async getClaim(claimId: string): Promise<Claim> {
    try {
      const result: any = await this.client.readContract({
        address: this.contractAddress,
        functionName: "get_claim",
        args: [claimId],
      });

      if (result instanceof Map) {
        return Object.fromEntries(result.entries()) as Claim;
      }
      return result as Claim;
    } catch (error) {
      console.error("Error fetching claim:", error);
      throw new Error("Failed to fetch claim from contract");
    }
  }

  /**
   * Get reputation for a specific user
   * @param address - User's address
   * @returns Reputation score
   */
  async getUserReputation(address: string | null): Promise<number> {
    if (!address) {
      return 0;
    }

    try {
      const reputation = await this.client.readContract({
        address: this.contractAddress,
        functionName: "get_user_reputation",
        args: [address],
      });

      return Number(reputation) || 0;
    } catch (error) {
      console.error("Error fetching user reputation:", error);
      return 0;
    }
  }

  /**
   * Get the reputation leaderboard
   * @returns Sorted array of reputation entries (highest to lowest)
   */
  async getLeaderboard(): Promise<ReputationEntry[]> {
    try {
      const reputation: any = await this.client.readContract({
        address: this.contractAddress,
        functionName: "get_reputation",
        args: [],
      });

      if (reputation instanceof Map) {
        return Array.from(reputation.entries())
          .map(([address, rep]: any) => ({
            address,
            reputation: Number(rep),
          }))
          .sort((a, b) => b.reputation - a.reputation);
      }

      // Handle plain object response
      if (reputation && typeof reputation === "object") {
        return Object.entries(reputation)
          .map(([address, rep]: any) => ({
            address,
            reputation: Number(rep),
          }))
          .sort((a, b) => b.reputation - a.reputation);
      }

      return [];
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      throw new Error("Failed to fetch leaderboard from contract");
    }
  }

  /**
   * Submit a new claim to be fact-checked
   * @param claimText - The claim to verify
   * @param sourceUrl - URL to use for verification
   * @returns Transaction receipt
   */
  async submitClaim(
    claimText: string,
    sourceUrl: string
  ): Promise<TransactionReceipt> {
    try {
      const txHash = await this.client.writeContract({
        address: this.contractAddress,
        functionName: "submit_claim",
        args: [claimText, sourceUrl],
        value: BigInt(0),
      });

      const receipt = await this.client.waitForTransactionReceipt({
        hash: txHash,
        status: "ACCEPTED" as any,
        retries: 24,
        interval: 5000,
      });

      return receipt as TransactionReceipt;
    } catch (error) {
      console.error("Error submitting claim:", error);
      throw new Error("Failed to submit claim");
    }
  }

  /**
   * Resolve (fact-check) a pending claim using AI
   * @param claimId - ID of the claim to fact-check
   * @returns Transaction receipt
   */
  async resolveClaim(claimId: string): Promise<TransactionReceipt> {
    try {
      const txHash = await this.client.writeContract({
        address: this.contractAddress,
        functionName: "resolve_claim",
        args: [claimId],
        value: BigInt(0),
      });

      const receipt = await this.client.waitForTransactionReceipt({
        hash: txHash,
        status: "ACCEPTED" as any,
        retries: 24,
        interval: 5000,
      });

      return receipt as TransactionReceipt;
    } catch (error) {
      console.error("Error resolving claim:", error);
      throw new Error("Failed to resolve claim");
    }
  }
}

export default TruthPost;
