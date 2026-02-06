"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import TruthPost from "../contracts/TruthPost";
import { getContractAddress, getStudioUrl } from "../genlayer/client";
import { useWallet } from "../genlayer/wallet";
import { success, error } from "../utils/toast";
import type { Claim, ReputationEntry } from "../contracts/types";

/**
 * Hook to get the TruthPost contract instance
 *
 * Returns null if contract address is not configured.
 * The contract instance is recreated whenever the wallet address changes.
 */
export function useTruthPostContract(): TruthPost | null {
  const { address } = useWallet();
  const contractAddress = getContractAddress();
  const studioUrl = getStudioUrl();

  const contract = useMemo(() => {
    if (!contractAddress) {
      return null;
    }
    return new TruthPost(contractAddress, address, studioUrl);
  }, [contractAddress, address, studioUrl]);

  return contract;
}

/**
 * Hook to fetch all claims
 */
export function useClaims() {
  const contract = useTruthPostContract();

  return useQuery<Claim[], Error>({
    queryKey: ["claims"],
    queryFn: () => {
      if (!contract) {
        return Promise.resolve([]);
      }
      return contract.getClaims();
    },
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract,
  });
}

/**
 * Hook to fetch user reputation
 */
export function useUserReputation(address: string | null) {
  const contract = useTruthPostContract();

  return useQuery<number, Error>({
    queryKey: ["reputation", address],
    queryFn: () => {
      if (!contract) {
        return Promise.resolve(0);
      }
      return contract.getUserReputation(address);
    },
    refetchOnWindowFocus: true,
    enabled: !!address && !!contract,
    staleTime: 2000,
  });
}

/**
 * Hook to fetch the reputation leaderboard
 */
export function useLeaderboard() {
  const contract = useTruthPostContract();

  return useQuery<ReputationEntry[], Error>({
    queryKey: ["leaderboard"],
    queryFn: () => {
      if (!contract) {
        return Promise.resolve([]);
      }
      return contract.getLeaderboard();
    },
    refetchOnWindowFocus: true,
    staleTime: 2000,
    enabled: !!contract,
  });
}

/**
 * Hook to submit a new claim
 */
export function useSubmitClaim() {
  const contract = useTruthPostContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({
      claimText,
      sourceUrl,
    }: {
      claimText: string;
      sourceUrl: string;
    }) => {
      if (!contract) {
        throw new Error(
          "Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file."
        );
      }
      if (!address) {
        throw new Error(
          "Wallet not connected. Please connect your wallet to submit a claim."
        );
      }
      setIsSubmitting(true);
      return contract.submitClaim(claimText, sourceUrl);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      queryClient.invalidateQueries({ queryKey: ["reputation"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      setIsSubmitting(false);
      success("Claim submitted successfully!", {
        description: "Your claim has been recorded on the blockchain.",
      });
    },
    onError: (err: any) => {
      console.error("Error submitting claim:", err);
      setIsSubmitting(false);
      error("Failed to submit claim", {
        description: err?.message || "Please try again.",
      });
    },
  });

  return {
    ...mutation,
    isSubmitting,
    submitClaim: mutation.mutate,
    submitClaimAsync: mutation.mutateAsync,
  };
}

/**
 * Hook to resolve (fact-check) a claim
 */
export function useResolveClaim() {
  const contract = useTruthPostContract();
  const { address } = useWallet();
  const queryClient = useQueryClient();
  const [isResolving, setIsResolving] = useState(false);
  const [resolvingClaimId, setResolvingClaimId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (claimId: string) => {
      if (!contract) {
        throw new Error(
          "Contract not configured. Please set NEXT_PUBLIC_CONTRACT_ADDRESS in your .env file."
        );
      }
      if (!address) {
        throw new Error(
          "Wallet not connected. Please connect your wallet to fact-check a claim."
        );
      }
      setIsResolving(true);
      setResolvingClaimId(claimId);
      return contract.resolveClaim(claimId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      queryClient.invalidateQueries({ queryKey: ["reputation"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      setIsResolving(false);
      setResolvingClaimId(null);
      success("Claim fact-checked!", {
        description: "The AI verdict has been recorded on-chain.",
      });
    },
    onError: (err: any) => {
      console.error("Error resolving claim:", err);
      setIsResolving(false);
      setResolvingClaimId(null);
      error("Failed to fact-check claim", {
        description: err?.message || "Please try again.",
      });
    },
  });

  return {
    ...mutation,
    isResolving,
    resolvingClaimId,
    resolveClaim: mutation.mutate,
    resolveClaimAsync: mutation.mutateAsync,
  };
}
