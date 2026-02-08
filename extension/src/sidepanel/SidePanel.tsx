import { useEffect, useRef, useState } from "react";
import { TabNav } from "../components/TabNav";
import { PdfUploader } from "../components/PdfUploader";
import { LanguageSelector } from "../components/LanguageSelector";
import { VoiceSelector } from "../components/VoiceSelector";
import { ProcessingStatus } from "../components/ProcessingStatus";
import { TranscriptViewer } from "../components/TranscriptViewer";
import { AudioPlayer } from "../components/AudioPlayer";
import * as api from "../lib/api";

type Tab = "clean" | "translate" | "tts" | "stt";

export function SidePanel() {
  const [activeTab, setActiveTab] = useState<Tab>("clean");
  const [status, setStatus] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  // Shared state
  const [extractedText, setExtractedText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("fr");
  const [selectedVoice, setSelectedVoice] = useState("YTpq7expH9539ERJ");
  const [isDownloadingTranslationPdf, setIsDownloadingTranslationPdf] = useState(false);
  const [isDownloadingTranscriptPdf, setIsDownloadingTranscriptPdf] = useState(false);

  const handleClean = async (file: File) => {
    setIsProcessing(true);
    setError("");
    setStatus("Uploading and cleaning PDF...");
    
    // Clear previous results when starting a new scan
    setExtractedText("");
    setTranslatedText("");
    setTranscript("");
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    
    try {
      const result = await api.cleanPdf(file);
      setExtractedText(result.text);
      setStatus(`Done! Processed ${result.pageCount} pages.`);

      // Trigger download of clean PDF
      const pdfBlob = new Blob(
        [Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0))],
        { type: "application/pdf" },
      );
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cleanscan-output.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message);
      setStatus("");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTranslate = async () => {
    const textToTranslate = translatedText || extractedText;
    if (!textToTranslate) return;
    setIsProcessing(true);
    setError("");
    setStatus("Translating...");
    try {
      const result = await api.translateText(
        textToTranslate,
        sourceLang,
        targetLang,
      );
      setTranslatedText(result);
      setStatus("Translation complete!");
    } catch (err: any) {
      setError(err.message);
      setStatus("");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTTS = async () => {
    const textToSpeak = translatedText || extractedText;
    if (!textToSpeak) return;
    setIsProcessing(true);
    setError("");
    setStatus("Generating audio...");
    try {
      const blob = await api.textToSpeech(
        textToSpeak,
        selectedVoice,
        targetLang,
      );
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));
      setStatus("Audio ready!");
    } catch (err: any) {
      setError(err.message);
      setStatus("");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadTranslationPdf = async () => {
    if (!translatedText) return;

    setIsDownloadingTranslationPdf(true);
    setError("");
    setStatus("Preparing translated PDF...");
    try {
      const pdfBlob = await api.translatedTextToPdf(translatedText, targetLang);
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `translated-${targetLang || "text"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Translated PDF downloaded!");
    } catch (err: any) {
      setError(err.message);
      setStatus("");
    } finally {
      setIsDownloadingTranslationPdf(false);
    }
  };

  const handleDownloadTranscriptPdf = async () => {
    if (!transcript) return;

    setIsDownloadingTranscriptPdf(true);
    setError("");
    setStatus("Preparing transcript PDF...");
    try {
      const pdfBlob = await api.translatedTextToPdf(transcript, sourceLang || "text");
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transcript-${sourceLang || "text"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Transcript PDF downloaded!");
    } catch (err: any) {
      setError(err.message);
      setStatus("");
    } finally {
      setIsDownloadingTranscriptPdf(false);
    }
  };

  const handleSTT = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setError("");
    setStatus(
      sourceLang === targetLang ? "Transcribing..." : "Transcribing and translating...",
    );
    try {
      const result = await api.speechToText(audioBlob, sourceLang, targetLang);
      const finalText =
        sourceLang === targetLang ? result.transcript : (result.translated || result.transcript);
      const cleaned = finalText?.trim();
      setTranscript(cleaned || "No speech detected.");
      setStatus(
        sourceLang === targetLang
          ? "Transcription complete!"
          : "Transcription and translation complete!",
      );
    } catch (err: any) {
      setError(err.message);
      setStatus("");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden text-slate-800">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 -left-24 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />
        <div className="absolute -bottom-24 -right-32 h-80 w-80 rounded-full bg-indigo-200/35 blur-[100px]" />
        <div className="absolute top-32 right-1/3 h-64 w-64 rounded-full bg-cyan-200/30 blur-[90px]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-5 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="glass-strong h-11 w-11 overflow-hidden rounded-2xl border border-white/80 shadow-lg shadow-slate-300/40">
              <img
                src="/icons/icon48.png"
                alt="ClearScan icon"
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-xl font-semibold leading-tight text-slate-900">
                ClearScan
              </h1>
            </div>
          </div>
        </header>

        <TabNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            setActiveTab(tab);
            setStatus("");
            setError("");
          }}
        />

        <main className="flex-1 space-y-5 overflow-y-auto px-5 pt-4 pb-7">
          <ProcessingStatus
            status={status}
            error={error}
            isProcessing={isProcessing}
          />

          {activeTab === "clean" && (
            <div className="glass-card space-y-5 rounded-3xl border-white/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Clean your scan
                  </h3>
                  <p className="text-sm text-slate-600">
                    Drop your PDF to denoise, de-skew, and prep text for
                    translation or audio.
                  </p>
                </div>
              </div>
              <PdfUploader onUpload={handleClean} disabled={isProcessing} />
              {extractedText && (
                <TranscriptViewer label="Extracted Text" text={extractedText} />
              )}
            </div>
          )}

          {activeTab === "translate" && (
            <div className="glass-card space-y-5 rounded-3xl border-white/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Translate instantly
                  </h3>
                  <p className="text-sm text-slate-600">
                    Preserve context while switching languages. Pick a source and
                    target, then translate in one tap.
                  </p>
                </div>
              </div>
              <LanguageSelector
                sourceLang={sourceLang}
                targetLang={targetLang}
                onSourceChange={setSourceLang}
                onTargetChange={setTargetLang}
              />
              <button
                onClick={handleTranslate}
                disabled={isProcessing || (!extractedText && !translatedText)}
                className="btn-primary w-full py-3"
              >
                Translate
              </button>
              {translatedText && (
                <TranscriptViewer
                  label="Translated Text"
                  text={translatedText}
                  onDownload={handleDownloadTranslationPdf}
                  downloading={isDownloadingTranslationPdf}
                />
              )}
            </div>
          )}

          {activeTab === "tts" && (
            <div className="glass-card space-y-5 rounded-3xl border-white/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Listen with natural voices
                  </h3>
                  <p className="text-sm text-slate-600">
                    Choose a voice and generate audio for the current text.
                  </p>
                </div>
              </div>
              <VoiceSelector
                selectedVoice={selectedVoice}
                onVoiceChange={setSelectedVoice}
                language={targetLang}
              />
              <button
                onClick={handleTTS}
                disabled={isProcessing || (!extractedText && !translatedText)}
                className="btn-primary w-full py-3"
              >
                Generate Audio
              </button>
              {audioUrl && <AudioPlayer src={audioUrl} />}
            </div>
          )}

          {activeTab === "stt" && (
            <div className="glass-card space-y-5 rounded-3xl border-white/60 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <h3 className="text-lg font-semibold text-slate-900">
                    Dictate back to text
                  </h3>
                  <p className="text-sm text-slate-600">
                    Record audio in your chosen source language and get a clean
                    transcript.
                  </p>
                </div>
              </div>
              <LanguageSelector
                sourceLang={sourceLang}
                targetLang={targetLang}
                onSourceChange={setSourceLang}
                onTargetChange={setTargetLang}
              />
              <AudioRecorderButton
                onRecorded={handleSTT}
                onError={(message) => {
                  setError(message);
                  setStatus("");
                }}
                disabled={isProcessing}
              />
              {transcript && (
                <TranscriptViewer
                  label="Extracted Text"
                  text={transcript}
                  variant="extracted"
                  onDownload={handleDownloadTranscriptPdf}
                  downloading={isDownloadingTranscriptPdf}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function AudioRecorderButton({
  onRecorded,
  onError,
  disabled,
}: {
  onRecorded: (blob: Blob) => void;
  onError: (message: string) => void;
  disabled: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [micPermission, setMicPermission] = useState<PermissionState | "unknown">(
    "unknown",
  );
  const [requestingPermission, setRequestingPermission] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;
    let permissionStatus: PermissionStatus | null = null;

    const hydratePermission = async () => {
      try {
        if (!navigator.permissions?.query) return;
        permissionStatus = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        if (!mounted) return;
        setMicPermission(permissionStatus.state);
        permissionStatus.onchange = () => {
          if (mounted) setMicPermission(permissionStatus?.state || "unknown");
        };
      } catch {
        setMicPermission("unknown");
      }
    };

    void hydratePermission();

    return () => {
      mounted = false;
      if (permissionStatus) permissionStatus.onchange = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  const requestMicrophoneAccess = async () => {
    setRequestingPermission(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      setMicPermission("granted");
      return stream;
    } catch (err: any) {
      if (err?.name === "NotAllowedError") setMicPermission("denied");
      throw err;
    } finally {
      setRequestingPermission(false);
    }
  };

  const toggle = async () => {
    try {
      onError("");
      if (recording) {
        mediaRecorderRef.current?.requestData();
        mediaRecorderRef.current?.stop();
        setRecording(false);
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone recording is not supported in this browser context.");
      }
      if (typeof MediaRecorder === "undefined") {
        throw new Error("Media recording is not supported in this browser.");
      }

      const stream = await requestMicrophoneAccess();
      streamRef.current = stream;

      const preferredMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];
      const mimeType = preferredMimeTypes.find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = () => {
        onError("Recorder failed while capturing audio. Please try again.");
      };
      recorder.onstop = () => {
        const elapsedMs = Math.max(0, Date.now() - recordingStartedAtRef.current);
        recordingStartedAtRef.current = 0;
        if (chunksRef.current.length > 0) {
          const outputType = mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: outputType });
          if (elapsedMs < 1000 || blob.size < 1024) {
            onError("Recorded audio is too short. Please record for at least 1 second.");
          } else {
            onRecorded(blob);
          }
        } else {
          onError("No audio captured. Please try recording again.");
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        mediaRecorderRef.current = null;
      };

      recordingStartedAtRef.current = Date.now();
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err: any) {
      const message =
        err?.name === "NotAllowedError"
          ? "Microphone access is blocked. In Chrome, open extension site settings and set Microphone to Allow."
          : err?.message || "Unable to start recording.";
      onError(message);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      mediaRecorderRef.current = null;
      recordingStartedAtRef.current = 0;
      setRecording(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={toggle}
        disabled={disabled || requestingPermission}
        className={`w-full rounded-2xl px-4 py-3 font-semibold transition-all ${
          recording
            ? "glass-strong border border-rose-200/80 bg-rose-50/75 text-rose-700 shadow-[0_12px_26px_rgba(244,63,94,0.15)]"
            : "glass-card border-white/65 text-slate-800 hover:border-slate-300/80 shadow-[0_12px_26px_rgba(15,23,42,0.12)]"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="inline-flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              recording ? "bg-rose-500 animate-pulse" : "bg-slate-400"
            }`}
          />
          {recording
            ? "Stop recording"
            : requestingPermission
              ? "Requesting microphone access..."
              : micPermission === "granted"
                ? "Start recording"
                : "Enable microphone access"}
        </span>
      </button>
      {micPermission === "denied" && (
        <p className="text-xs text-rose-600">
          Microphone access is blocked for this extension. Allow it in Chrome site
          settings, then reload the extension.
        </p>
      )}
    </div>
  );
}
