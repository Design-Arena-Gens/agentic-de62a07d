'use client';

import ShortAgent from "@/components/ShortAgent";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(circle_at_top,_#1e293b,_transparent_60%)] py-16 text-slate-50">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 sm:px-8 lg:flex-row lg:gap-16">
        <header className="max-w-xl space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/60 px-4 py-1 text-xs uppercase tracking-[0.2em] text-sky-300">
            Autopilot Creator
          </span>
          <h1 className="font-display text-4xl font-semibold leading-tight text-slate-50 sm:text-5xl">
            Generate binge-worthy YouTube Shorts in minutes.
          </h1>
          <p className="text-lg leading-relaxed text-slate-300">
            Feed the agent a topic. It drafts hooks, scripts, shot lists, adds kinetic captions, and renders a downloadable 1080×1920 MP4 — no editing suite or plugins required.
          </p>
          <ul className="space-y-2 text-sm text-slate-400">
            <li>• AI-crafted hooks, beats, and CTA tuned for Shorts algorithms</li>
            <li>• Motion-ready captions and visual direction for each bar</li>
            <li>• WebAssembly FFmpeg pipeline renders vertical video instantly</li>
          </ul>
        </header>
        <main className="flex-1">
          <ShortAgent />
        </main>
      </div>
    </div>
  );
}
