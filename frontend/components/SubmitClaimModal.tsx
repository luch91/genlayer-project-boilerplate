"use client";

import { useState, useEffect } from "react";
import { Plus, Loader2, FileText, Link } from "lucide-react";
import { useSubmitClaim } from "@/lib/hooks/useTruthPost";
import { useWallet } from "@/lib/genlayer/wallet";
import { error } from "@/lib/utils/toast";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function SubmitClaimModal() {
  const { isConnected, address, isLoading } = useWallet();
  const { submitClaim, isSubmitting, isSuccess } = useSubmitClaim();

  const [isOpen, setIsOpen] = useState(false);
  const [claimText, setClaimText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");

  const [errors, setErrors] = useState({
    claimText: "",
    sourceUrl: "",
  });

  // Auto-close modal when wallet disconnects
  useEffect(() => {
    if (!isConnected && isOpen && !isSubmitting) {
      setIsOpen(false);
    }
  }, [isConnected, isOpen, isSubmitting]);

  const validateForm = (): boolean => {
    const newErrors = {
      claimText: "",
      sourceUrl: "",
    };

    if (!claimText.trim()) {
      newErrors.claimText = "Please enter a claim to fact-check";
    }

    if (!sourceUrl.trim()) {
      newErrors.sourceUrl = "Please enter a source URL for verification";
    } else {
      try {
        new URL(sourceUrl.trim());
      } catch {
        newErrors.sourceUrl = "Please enter a valid URL (e.g., https://...)";
      }
    }

    setErrors(newErrors);
    return !Object.values(newErrors).some((e) => e !== "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !address) {
      error("Please connect your wallet first");
      return;
    }

    if (!validateForm()) {
      return;
    }

    submitClaim({
      claimText: claimText.trim(),
      sourceUrl: sourceUrl.trim(),
    });
  };

  const resetForm = () => {
    setClaimText("");
    setSourceUrl("");
    setErrors({ claimText: "", sourceUrl: "" });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) {
      resetForm();
    }
    setIsOpen(open);
  };

  // Reset form and close modal on success
  useEffect(() => {
    if (isSuccess) {
      resetForm();
      setIsOpen(false);
    }
  }, [isSuccess]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="gradient"
          disabled={!isConnected || !address || isLoading}
        >
          <Plus className="w-4 h-4 mr-2" />
          Submit Claim
        </Button>
      </DialogTrigger>
      <DialogContent className="brand-card border-2 sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Submit a Claim
          </DialogTitle>
          <DialogDescription>
            Enter a factual claim and a source URL. The AI will verify it
            on-chain.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          {/* Claim Text */}
          <div className="space-y-2">
            <Label htmlFor="claimText" className="flex items-center gap-2">
              <FileText className="w-4 h-4 !text-white" />
              Claim
            </Label>
            <textarea
              id="claimText"
              value={claimText}
              onChange={(e) => {
                setClaimText(e.target.value);
                setErrors({ ...errors, claimText: "" });
              }}
              placeholder='e.g., "The Eiffel Tower is 330 meters tall"'
              rows={3}
              className={`flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none ${
                errors.claimText
                  ? "border-destructive"
                  : "border-input"
              }`}
            />
            {errors.claimText && (
              <p className="text-xs text-destructive">{errors.claimText}</p>
            )}
          </div>

          {/* Source URL */}
          <div className="space-y-2">
            <Label htmlFor="sourceUrl" className="flex items-center gap-2">
              <Link className="w-4 h-4 !text-white" />
              Source URL
            </Label>
            <Input
              id="sourceUrl"
              type="url"
              value={sourceUrl}
              onChange={(e) => {
                setSourceUrl(e.target.value);
                setErrors({ ...errors, sourceUrl: "" });
              }}
              placeholder="https://en.wikipedia.org/wiki/Eiffel_Tower"
              className={errors.sourceUrl ? "border-destructive" : ""}
            />
            <p className="text-xs text-muted-foreground">
              The AI will fetch this URL to verify the claim against real data
            </p>
            {errors.sourceUrl && (
              <p className="text-xs text-destructive">{errors.sourceUrl}</p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="gradient"
              className="flex-1"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                "Submit Claim"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
