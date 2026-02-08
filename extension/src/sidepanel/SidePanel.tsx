import { useState, useRef } from "react";
import { TabNav } from "../components/TabNav";
import { PdfUploader } from "../components/PdfUploader";
import { LanguageSelector } from "../components/LanguageSelector";
import { VoiceSelector } from "../components/VoiceSelector";
import { ProcessingStatus } from "../components/ProcessingStatus";
import { TranscriptViewer } from "../components/TranscriptViewer";
import { AudioPlayer } from "../components/AudioPlayer";
import * as api from "../lib/api";
import { VOICES } from "../lib/constants";

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

  const handleTTSForTranslation = async () => {
    if (!translatedText) return;
    setIsProcessing(true);
    setError("");
    setStatus("Generating audio...");
    try {
      const voiceId = selectedVoice || VOICES.find((v) => v.language === targetLang)?.id;
      const blob = await api.textToSpeech(translatedText, voiceId, targetLang);
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
      const cleaned = result?.trim();
      if (!cleaned) {
        setTranscript("No speech detected.");
        setStatus("Transcription complete!");
        return;
      }

      if (targetLang && targetLang !== sourceLang) {
        setStatus("Translating...");
        const translated = await api.translateText(cleaned, sourceLang, targetLang);
        const finalText = translated || cleaned;
        setTranscript(finalText);
        setStatus("Generating audio...");
        const voiceForLang = VOICES.find((v) => v.language === targetLang);
        const voiceId = voiceForLang ? voiceForLang.id : selectedVoice;
        const ttsBlob = await api.textToSpeech(finalText, voiceId, targetLang);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(ttsBlob));
        setStatus("Transcription complete!");
        return;
      }

      setTranscript(cleaned);
      setStatus("Generating audio...");
      const voiceForLang = VOICES.find((v) => v.language === sourceLang);
      const voiceId = voiceForLang ? voiceForLang.id : selectedVoice;
      const ttsBlob = await api.textToSpeech(cleaned, voiceId, sourceLang);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(ttsBlob));
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
              <>
                <TranscriptViewer label="Translated Text" text={translatedText} />
                <VoiceSelector
                  selectedVoice={selectedVoice}
                  onVoiceChange={setSelectedVoice}
                  language={targetLang}
                />
                <button
                  onClick={handleTTSForTranslation}
                  disabled={isProcessing || !translatedText}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
                >
                  Generate Audio
                </button>
                {audioUrl && <AudioPlayer src={audioUrl} />}
              </>
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
            {audioUrl && <AudioPlayer src={audioUrl} />}
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
  const [lastRecordingUrl, setLastRecordingUrl] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef<number>(44100);

  const mergeBuffers = (chunks: Float32Array[]) => {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  };

  const encodeWav = (samples: Float32Array, sampleRate: number) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i += 1) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i += 1) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    return new Blob([view], { type: "audio/wav" });
  };

  const stopRecording = async () => {
    setRecording(false);

    if (processorRef.current) processorRef.current.disconnect();
    if (sourceRef.current) sourceRef.current.disconnect();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());

    if (audioContextRef.current) {
      await audioContextRef.current.close();
    }

    const samples = mergeBuffers(audioChunksRef.current);
    audioChunksRef.current = [];
    if (samples.length === 0) {
      alert("No audio captured. Check your microphone input and try again.");
      return;
    }

    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) {
      sum += Math.abs(samples[i]);
    }
    const avg = sum / samples.length;
    const wavBlob = encodeWav(samples, sampleRateRef.current);
    if (lastRecordingUrl) URL.revokeObjectURL(lastRecordingUrl);
    setLastRecordingUrl(URL.createObjectURL(wavBlob));
    if (avg < 0.0002) {
      alert("Audio is too quiet. Increase mic volume or speak closer and try again.");
      return;
    }
    onRecorded(wavBlob);
  };

  const toggle = async () => {
    if (recording) {
      await stopRecording();
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        if (audioContext.state === "suspended") {
          // Ensure audio processing starts after the user gesture
          await audioContext.resume();
        }
        sampleRateRef.current = audioContext.sampleRate;

        const source = audioContext.createMediaStreamSource(stream);
        sourceRef.current = source;

        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        audioChunksRef.current = [];
        processor.onaudioprocess = (event) => {
          const input = event.inputBuffer.getChannelData(0);
          audioChunksRef.current.push(new Float32Array(input));
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
        setRecording(true);
      } catch (err: any) {
        console.error("[Recorder] Failed to start recording:", err);
        alert(`Could not access microphone: ${err.message}`);
      }
    }
  };

  return (
    <div className="space-y-2">
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
      {lastRecordingUrl && (
        <a
          href={lastRecordingUrl}
          download="recording.wav"
          className="block text-sm text-blue-600 hover:underline"
        >
          Download last recording
        </a>
      )}
    </div>
  );
}
