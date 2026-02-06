"use client";

import { Loader2, Search, Clock, AlertCircle, CheckCircle, XCircle, AlertTriangle, ExternalLink } from "lucide-react";
import { useClaims, useResolveClaim, useTruthPostContract } from "@/lib/hooks/useTruthPost";
import { useWallet } from "@/lib/genlayer/wallet";
import { error } from "@/lib/utils/toast";
import { AddressDisplay } from "./AddressDisplay";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import type { Claim } from "@/lib/contracts/types";

function VerdictBadge({ verdict }: { verdict: string }) {
  switch (verdict) {
    case "true":
      return (
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
          <CheckCircle className="w-3 h-3 mr-1" />
          True
        </Badge>
      );
    case "false":
      return (
        <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
          <XCircle className="w-3 h-3 mr-1" />
          False
        </Badge>
      );
    case "partially_true":
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Partially True
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-gray-400 border-gray-500/30">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      );
  }
}

function getSourceHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function ClaimsTable() {
  const contract = useTruthPostContract();
  const { data: claims, isLoading, isError } = useClaims();
  const { address, isConnected, isLoading: isWalletLoading } = useWallet();
  const { resolveClaim, isResolving, resolvingClaimId } = useResolveClaim();

  const handleResolve = (claimId: string) => {
    if (!address) {
      error("Please connect your wallet to fact-check claims");
      return;
    }

    const confirmed = confirm(
      "Are you sure you want to fact-check this claim? The AI will fetch the source URL and analyze the claim."
    );

    if (confirmed) {
      resolveClaim(claimId);
    }
  };

  if (isLoading) {
    return (
      <div className="brand-card p-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Loading claims...</p>
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="brand-card p-12">
        <div className="text-center space-y-4">
          <AlertCircle className="w-16 h-16 mx-auto text-yellow-400 opacity-60" />
          <h3 className="text-xl font-bold">Setup Required</h3>
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Contract address not configured.
            </p>
            <p className="text-sm text-muted-foreground">
              Please set{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-xs">
                NEXT_PUBLIC_CONTRACT_ADDRESS
              </code>{" "}
              in your .env file.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="brand-card p-8">
        <div className="text-center">
          <p className="text-destructive">
            Failed to load claims. Please try again.
          </p>
        </div>
      </div>
    );
  }

  if (!claims || claims.length === 0) {
    return (
      <div className="brand-card p-12">
        <div className="text-center space-y-3">
          <Search className="w-16 h-16 mx-auto text-muted-foreground opacity-30" />
          <h3 className="text-xl font-bold">No Claims Yet</h3>
          <p className="text-muted-foreground">
            Be the first to submit a claim for fact-checking!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {claims.map((claim) => (
        <ClaimCard
          key={claim.id}
          claim={claim}
          currentAddress={address}
          isConnected={isConnected}
          isWalletLoading={isWalletLoading}
          onResolve={handleResolve}
          isResolving={isResolving && resolvingClaimId === claim.id}
        />
      ))}
    </div>
  );
}

interface ClaimCardProps {
  claim: Claim;
  currentAddress: string | null;
  isConnected: boolean;
  isWalletLoading: boolean;
  onResolve: (claimId: string) => void;
  isResolving: boolean;
}

function ClaimCard({
  claim,
  currentAddress,
  isConnected,
  isWalletLoading,
  onResolve,
  isResolving,
}: ClaimCardProps) {
  const isSubmitter =
    currentAddress?.toLowerCase() === claim.submitter?.toLowerCase();
  const canResolve =
    isConnected && currentAddress && !claim.has_been_checked && !isWalletLoading;

  return (
    <div className="brand-card p-6 space-y-3 animate-fade-in">
      {/* Claim text */}
      <p className="text-lg font-medium leading-relaxed">
        &ldquo;{claim.text}&rdquo;
      </p>

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <VerdictBadge verdict={claim.verdict} />

        <a
          href={claim.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-muted-foreground hover:text-accent transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          {getSourceHostname(claim.source_url)}
        </a>

        <div className="flex items-center gap-1 text-muted-foreground">
          <span>By:</span>
          <AddressDisplay
            address={claim.submitter}
            maxLength={10}
            showCopy={true}
          />
          {isSubmitter && (
            <Badge variant="secondary" className="text-xs ml-1">
              You
            </Badge>
          )}
        </div>
      </div>

      {/* AI explanation (shown after fact-check) */}
      {claim.has_been_checked && claim.explanation && (
        <div className="bg-white/5 rounded-lg p-4 border border-white/5">
          <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase tracking-wider">
            AI Analysis
          </p>
          <p className="text-sm text-foreground/80">{claim.explanation}</p>
        </div>
      )}

      {/* Resolve button (only for pending claims) */}
      {canResolve && (
        <div className="pt-1">
          <Button
            onClick={() => onResolve(claim.id)}
            disabled={isResolving}
            size="sm"
            variant="gradient"
          >
            {isResolving ? (
              <>
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Fact-checking with AI...
              </>
            ) : (
              <>
                <Search className="w-3 h-3 mr-1" />
                Fact-Check This Claim
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
