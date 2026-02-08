import { useState, useRef } from "react";
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

  const handleSTT = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setError("");
    setStatus("Transcribing...");
    try {
      const result = await api.speechToText(audioBlob, sourceLang);
      setTranscript(result);
      setStatus("Transcription complete!");
    } catch (err: any) {
      setError(err.message);
      setStatus("");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-blue-600 text-white p-3">
        <h1 className="text-lg font-bold">ClearScan</h1>
      </header>

      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ProcessingStatus
          status={status}
          error={error}
          isProcessing={isProcessing}
        />

        {activeTab === "clean" && (
          <>
            <PdfUploader onUpload={handleClean} disabled={isProcessing} />
            {extractedText && (
              <TranscriptViewer label="Extracted Text" text={extractedText} />
            )}
          </>
        )}

        {activeTab === "translate" && (
          <>
            <LanguageSelector
              sourceLang={sourceLang}
              targetLang={targetLang}
              onSourceChange={setSourceLang}
              onTargetChange={setTargetLang}
            />
            <button
              onClick={handleTranslate}
              disabled={isProcessing || (!extractedText && !translatedText)}
              className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
            >
              Translate
            </button>
            {translatedText && (
              <TranscriptViewer label="Translated Text" text={translatedText} />
            )}
          </>
        )}

        {activeTab === "tts" && (
          <>
            <VoiceSelector
              selectedVoice={selectedVoice}
              onVoiceChange={setSelectedVoice}
              language={targetLang}
            />
            <button
              onClick={handleTTS}
              disabled={isProcessing || (!extractedText && !translatedText)}
              className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
            >
              Generate Audio
            </button>
            {audioUrl && <AudioPlayer src={audioUrl} />}
          </>
        )}

        {activeTab === "stt" && (
          <>
            <LanguageSelector
              sourceLang={sourceLang}
              targetLang={targetLang}
              onSourceChange={setSourceLang}
              onTargetChange={setTargetLang}
            />
            <AudioRecorderButton
              onRecorded={handleSTT}
              disabled={isProcessing}
            />
            {transcript && (
              <TranscriptViewer label="Transcript" text={transcript} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AudioRecorderButton({
  onRecorded,
  disabled,
}: {
  onRecorded: (blob: Blob) => void;
  disabled: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const toggle = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
    } else {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        onRecorded(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={disabled}
      className={`w-full py-3 rounded-lg font-medium transition cursor-pointer ${
        recording
          ? "bg-red-600 text-white hover:bg-red-700"
          : "bg-gray-200 text-gray-800 hover:bg-gray-300"
      } disabled:opacity-50`}
    >
      {recording ? "Stop Recording" : "Start Recording"}
    </button>
  );
}
