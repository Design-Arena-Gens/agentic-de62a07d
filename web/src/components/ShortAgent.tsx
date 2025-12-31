"use client";

import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import {
  estimateRuntime,
  generateShortPlan,
  type ShortPlan,
  type ShortSegment,
  type ShortStyle,
} from "@/lib/shortPlan";

const FF_CORE_VERSION = "0.12.15";
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const FPS = 30;

type StatusMessage = {
  label: string;
  timestamp: number;
};

const STYLE_OPTIONS: { label: string; value: ShortStyle; description: string }[] =
  [
    {
      label: "Educational Breakdown",
      value: "educational",
      description: "Teaches frameworks and actionable steps.",
    },
    {
      label: "Story Arc",
      value: "story",
      description: "Narrative pacing with a plot twist payoff.",
    },
    {
      label: "Product Highlight",
      value: "product",
      description: "Launch a product with social proof and urgency.",
    },
    {
      label: "Motivational Push",
      value: "motivational",
      description: "Pep talk energy with mantra and challenge.",
    },
  ];

const createGradient = (
  ctx: CanvasRenderingContext2D,
  index: number,
  total: number,
) => {
  const hue = (index / Math.max(total - 1, 1)) * 300;
  const gradient = ctx.createLinearGradient(0, 0, 0, VIDEO_HEIGHT);
  gradient.addColorStop(0, `hsl(${Math.round((hue + 10) % 360)}, 82%, 60%)`);
  gradient.addColorStop(
    1,
    `hsl(${Math.round((hue + 90) % 360)}, 92%, 28%)`,
  );
  return gradient;
};

const wrapText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) => {
  const words = text.split(" ");
  let line = "";
  const lines: { text: string; y: number }[] = [];
  for (let n = 0; n < words.length; n += 1) {
    const testLine = `${line}${words[n]} `;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      lines.push({ text: line.trimEnd(), y });
      line = `${words[n]} `;
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  lines.push({ text: line.trimEnd(), y });
  lines.forEach((entry) => ctx.fillText(entry.text, x, entry.y));
  return y + lineHeight;
};

const canvasToUint8Array = async (canvas: HTMLCanvasElement) =>
  new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to generate slide image"));
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const buffer = reader.result;
        if (buffer instanceof ArrayBuffer) {
          resolve(new Uint8Array(buffer));
        } else {
          reject(new Error("Unexpected buffer type"));
        }
      };
      reader.readAsArrayBuffer(blob);
    }, "image/png");
  });

const renderSlideImage = async (
  segment: ShortSegment,
  index: number,
  total: number,
  headline: string,
) => {
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to acquire canvas context");

  ctx.fillStyle = createGradient(ctx, index, total);
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

  ctx.fillStyle = "rgba(6, 10, 28, 0.45)";
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.fillRect(72, 72, VIDEO_WIDTH - 144, VIDEO_HEIGHT - 144);

  ctx.fillStyle = "rgba(10, 10, 15, 0.08)";
  ctx.fillRect(100, 200, VIDEO_WIDTH - 200, 4);

  ctx.font = "700 40px 'Geist Sans', system-ui, -apple-system";
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.fillText(headline, 112, 150);

  ctx.font = "500 92px 'Geist Sans', system-ui, -apple-system";
  ctx.fillStyle = "white";
  const captionBottom = wrapText(ctx, segment.caption, 112, 320, 856, 110);

  ctx.font = "400 42px 'Geist Sans', system-ui, -apple-system";
  ctx.fillStyle = "rgba(226, 232, 255, 0.8)";
  wrapText(ctx, segment.narration, 112, captionBottom + 80, 856, 60);

  ctx.fillStyle = "rgba(15, 15, 25, 0.26)";
  ctx.font = "500 32px 'Geist Sans', system-ui, -apple-system";
  ctx.fillText(segment.visualCue, 112, VIDEO_HEIGHT - 220);

  ctx.font = "600 48px 'Geist Sans', system-ui, -apple-system";
  ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
  const beatBadge = `${index + 1}/${total}`;
  const badgeMetrics = ctx.measureText(beatBadge);
  const badgeX = VIDEO_WIDTH - badgeMetrics.width - 120;
  ctx.fillText(beatBadge, badgeX, 150);

  return canvasToUint8Array(canvas);
};

const ensureFFmpeg = async (ffmpegRef: MutableRefObject<FFmpeg | null>) => {
  if (ffmpegRef.current?.loaded) {
    return ffmpegRef.current;
  }
  const base = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FF_CORE_VERSION}/dist/`;
  const [coreURL, wasmURL, workerURL] = await Promise.all([
    toBlobURL(`${base}ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${base}ffmpeg-core.wasm`, "application/wasm"),
    toBlobURL(`${base}ffmpeg-core.worker.js`, "text/javascript"),
  ]);

  const instance = ffmpegRef.current ?? new FFmpeg();
  ffmpegRef.current = instance;
  if (!instance.loaded) {
    await instance.load({ coreURL, wasmURL, workerURL });
  }
  return instance;
};

const ShortAgent = () => {
  const [style, setStyle] = useState<ShortStyle>("educational");
  const [topic, setTopic] = useState<string>("YouTube Shorts growth hacks");
  const [plan, setPlan] = useState<ShortPlan | null>(null);
  const [status, setStatus] = useState<StatusMessage[]>([]);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isRenderingVideo, setIsRenderingVideo] = useState(false);
  const [ffmpegReady, setFfmpegReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const ffmpegRef = useRef<FFmpeg | null>(null);
  const logHandlerRef = useRef<((payload: { message?: string }) => void) | null>(
    null,
  );
  const progressHandlerRef = useRef<
    ((payload: { ratio?: number; progress?: number }) => void) | null
  >(null);

  const appendStatus = useCallback((label: string) => {
    setStatus((entries) => [
      { label, timestamp: Date.now() },
      ...entries.slice(0, 6),
    ]);
  }, []);

  const loadFFmpeg = useCallback(async () => {
    try {
      appendStatus("Booting WebAssembly encoder…");
      const ffmpeg = await ensureFFmpeg(ffmpegRef);
      if (!logHandlerRef.current) {
        logHandlerRef.current = ({ message = "" }) => {
          if (message.trim()) appendStatus(message);
        };
        ffmpeg.on("log", logHandlerRef.current);
      }
      if (!progressHandlerRef.current) {
        progressHandlerRef.current = ({ ratio, progress: progressValue }) => {
          let value =
            typeof ratio === "number"
              ? ratio
              : typeof progressValue === "number"
                ? progressValue
                : 0;
          if (value > 1) value /= 100;
          setProgress(Math.min(100, Math.round(value * 100)));
        };
        ffmpeg.on("progress", progressHandlerRef.current);
      }
      setFfmpegReady(true);
      appendStatus("Encoder ready.");
    } catch (error) {
      appendStatus("Unable to load FFmpeg.");
      console.error(error);
    }
  }, [appendStatus]);

  useEffect(() => {
    loadFFmpeg().catch(() => {
      appendStatus("Failed to initialise encoder.");
    });
  }, [appendStatus, loadFFmpeg]);

  const runtimeEstimate = useMemo(
    () => (plan ? estimateRuntime(plan.segments) : null),
    [plan],
  );

  const handleGeneratePlan = useCallback(() => {
    setIsGeneratingPlan(true);
    setVideoUrl(null);
    try {
      const blueprint = generateShortPlan(topic, style);
      setPlan(blueprint);
      appendStatus("Storyboard refreshed with new beat map.");
    } finally {
      setIsGeneratingPlan(false);
    }
  }, [appendStatus, style, topic]);

  const cleanupVirtualFS = useCallback(async () => {
    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) return;
    try {
      const nodes = await ffmpeg.listDir("/");
      await Promise.all(
        nodes
          .filter((node) => !node.isDir && node.name !== "." && node.name !== "..")
          .map((node) =>
            ffmpeg.deleteFile(node.name).catch(() => {
              /* ignore */
            }),
          ),
      );
    } catch {
      // ignore FS errors
    }
  }, []);

  const handleRenderVideo = useCallback(async () => {
    if (!plan) {
      appendStatus("Generate a storyboard first.");
      return;
    }
    if (!ffmpegReady) {
      appendStatus("Encoder still loading, one sec…");
      return;
    }

    setIsRenderingVideo(true);
    setProgress(0);
    appendStatus("Rendering slides for each beat…");

    const ffmpeg = ffmpegRef.current;
    if (!ffmpeg) {
      appendStatus("FFmpeg unavailable.");
      setIsRenderingVideo(false);
      return;
    }

    try {
      await cleanupVirtualFS();

      for (let index = 0; index < plan.segments.length; index += 1) {
        const segment = plan.segments[index];
        const imageFile = `slide-${index}.png`;
        const segmentFile = `segment-${index}.mp4`;
        const slideBytes = await renderSlideImage(
          segment,
          index,
          plan.segments.length,
          plan.title,
        );
        await ffmpeg.writeFile(imageFile, slideBytes);
        await ffmpeg.exec([
          "-loop",
          "1",
          "-t",
          segment.duration.toFixed(2),
          "-i",
          imageFile,
          "-vf",
          "scale=1080:1920:flags=lanczos:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
          "-r",
          String(FPS),
          "-an",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          segmentFile,
        ]);
        await ffmpeg.deleteFile(imageFile).catch(() => {
          /* ignore */
        });
        appendStatus(`Segment ${index + 1} locked.`);
      }

      const manifest = plan.segments
        .map((_, index) => `file segment-${index}.mp4`)
        .join("\n");
      await ffmpeg.writeFile("filelist.txt", manifest);

      appendStatus("Stitching timeline…");
      await ffmpeg.exec([
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        "filelist.txt",
        "-c",
        "copy",
        "short.mp4",
      ]);

      const output = await ffmpeg.readFile("short.mp4");
      const binary =
        output instanceof Uint8Array
          ? output
          : new TextEncoder().encode(String(output));
      const arrayBuffer = binary.buffer.slice(
        binary.byteOffset,
        binary.byteOffset + binary.byteLength,
      ) as ArrayBuffer;
      const blob = new Blob([arrayBuffer], { type: "video/mp4" });
      const url = URL.createObjectURL(blob);
      setVideoUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
      await Promise.all(
        plan.segments.map((_, index) =>
          ffmpeg.deleteFile(`segment-${index}.mp4`).catch(() => {
            /* ignore */
          }),
        ),
      );
      await ffmpeg.deleteFile("filelist.txt").catch(() => {
        /* ignore */
      });
      appendStatus("Short rendered — ready to download.");
    } catch (error) {
      console.error(error);
      appendStatus("Render failed. Check console for details.");
    } finally {
      setIsRenderingVideo(false);
    }
  }, [appendStatus, cleanupVirtualFS, ffmpegReady, plan]);

  const handleDownload = useCallback(() => {
    if (!videoUrl) return;
    const anchor = document.createElement("a");
    anchor.href = videoUrl;
    anchor.download = "youtube-short.mp4";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    appendStatus("Download triggered.");
  }, [appendStatus, videoUrl]);

  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-[0_30px_120px_-45px_rgba(15,118,255,0.55)] backdrop-blur">
      <div className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="topic"
            className="text-sm font-medium uppercase tracking-[0.22em] text-sky-300"
          >
            Topic or product
          </label>
          <input
            id="topic"
            className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-500/20"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Launching a faceless automation channel"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {STYLE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStyle(option.value)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                style === option.value
                  ? "border-sky-400 bg-sky-500/10 text-sky-100 shadow-[0_0_30px_-12px_rgba(14,165,233,0.8)]"
                  : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500"
              }`}
            >
              <p className="text-sm font-semibold uppercase tracking-[0.18em]">
                {option.label}
              </p>
              <p className="mt-2 text-sm text-slate-400">{option.description}</p>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleGeneratePlan}
            disabled={isGeneratingPlan}
            className="flex-1 rounded-full bg-sky-500 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-950 transition hover:bg-sky-400 disabled:cursor-wait disabled:bg-sky-500/70"
          >
            {isGeneratingPlan ? "Synthesising…" : "Generate Blueprint"}
          </button>
          <button
            type="button"
            onClick={handleRenderVideo}
            disabled={isRenderingVideo || !plan}
            className="flex-1 rounded-full border border-slate-600 bg-slate-950/60 px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-100 transition hover:border-sky-300 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
          >
            {isRenderingVideo ? `Rendering ${progress}%` : "Render MP4"}
          </button>
        </div>
      </div>

      {plan && (
        <div className="mt-8 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-lg font-semibold text-slate-100">
                {plan.title}
              </p>
              <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-300">
                {runtimeEstimate ?? 0}s Runtime
              </span>
            </div>
            <p className="mt-3 text-sm text-sky-200">{plan.hook}</p>
            <p className="mt-2 text-sm text-slate-400">{plan.summary}</p>
            <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-500">
              CTA: {plan.cta}
            </p>
          </div>

          <ol className="space-y-3">
            {plan.segments.map((segment) => (
              <li
                key={segment.id}
                className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                      {segment.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">
                      {segment.caption}
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-400">
                    {segment.duration.toFixed(1)}s
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-300">
                  Narration: {segment.narration}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.28em] text-slate-500">
                  Visual cue: {segment.visualCue}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="mt-8 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            Build log
          </p>
          {videoUrl && (
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-full border border-sky-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-sky-200 hover:bg-sky-500/20"
            >
              Download MP4
            </button>
          )}
        </div>
        <div className="max-h-60 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-400">
          {status.length === 0 ? (
            <p className="text-slate-600">Waiting for first run…</p>
          ) : (
            <ul className="space-y-2">
              {status.map((entry) => (
                <li key={entry.timestamp}>
                  <span className="text-slate-600">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>{" "}
                  — {entry.label}
                </li>
              ))}
            </ul>
          )}
        </div>
        {videoUrl && (
          <video
            controls
            className="h-[420px] w-full rounded-3xl border border-slate-800 bg-black object-cover"
            src={videoUrl}
          />
        )}
      </div>
    </section>
  );
};

export default ShortAgent;
