"use client";

import { Navbar } from "@/components/Navbar";
import { ClaimsTable } from "@/components/ClaimsTable";
import { Leaderboard } from "@/components/Leaderboard";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <Navbar />

      {/* Main Content - Padding to account for fixed navbar */}
      <main className="flex-grow pt-20 pb-12 px-4 md:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-8 animate-fade-in">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4">
              TruthPost
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Decentralized fact-checking powered by AI on GenLayer.
              <br />
              Submit claims, verify facts, and earn reputation.
            </p>
          </div>

          {/* Main Grid Layout - 2/1 columns on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            {/* Left Column - Claims (67% on desktop) */}
            <div className="lg:col-span-8 animate-slide-up">
              <ClaimsTable />
            </div>

            {/* Right Column - Leaderboard (33% on desktop) */}
            <div className="lg:col-span-4 animate-slide-up" style={{ animationDelay: "100ms" }}>
              <Leaderboard />
            </div>
          </div>

          {/* Info Section */}
          <div className="mt-8 glass-card p-6 md:p-8 animate-fade-in" style={{ animationDelay: "200ms" }}>
            <h2 className="text-2xl font-bold mb-4">How it Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="text-accent font-bold text-lg">1. Submit a Claim</div>
                <p className="text-sm text-muted-foreground">
                  Connect your wallet and submit any factual claim with a source URL for the AI to verify against.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-accent font-bold text-lg">2. AI Fact-Checks It</div>
                <p className="text-sm text-muted-foreground">
                  GenLayer fetches the source URL and uses AI to analyze whether the claim is true, false, or partially true.
                </p>
              </div>
              <div className="space-y-2">
                <div className="text-accent font-bold text-lg">3. Validators Agree</div>
                <p className="text-sm text-muted-foreground">
                  Multiple validators independently verify through Optimistic Democracy consensus and the Equivalence Principle.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-2">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
              <a
                href="https://genlayer.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                Powered by GenLayer
              </a>
              <a
                href="https://studio.genlayer.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                Studio
              </a>
              <a
                href="https://docs.genlayer.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                Docs
              </a>
              <a
                href="https://github.com/genlayerlabs/genlayer-project-boilerplate"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent transition-colors"
              >
                GitHub
              </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
