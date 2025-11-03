import React, { useState, useRef, useEffect, useCallback } from 'react';
import { generateDescription, generateSpeech, decode, decodeAudioData } from './services/geminiService';
import { Spinner } from './components/Spinner';
import { SettingsModal } from './components/SettingsModal';
import { Camera, CameraOff, Sparkles, Volume2, VolumeX, Settings, AlertTriangle } from 'lucide-react';
import { ToggleSwitch } from './components/ToggleSwitch';

const App: React.FC = () => {
    const [isStreaming, setIsStreaming] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [statusText, setStatusText] = useState<string>('Камера выключена');
    const [accidentAlert, setAccidentAlert] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isSpeechEnabled, setIsSpeechEnabled] = useState<boolean>(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
    const [selectedVoice, setSelectedVoice] = useState<string>('Kore');
    const [speechRate, setSpeechRate] = useState<number>(1.0);
    const [isInCooldown, setIsInCooldown] = useState<boolean>(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const analysisTimerRef = useRef<number | null>(null);
    const cooldownTimerRef = useRef<number | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);


    const cleanup = useCallback(() => {
        if (analysisTimerRef.current) {
            clearTimeout(analysisTimerRef.current);
            analysisTimerRef.current = null;
        }
        if (cooldownTimerRef.current) {
            clearTimeout(cooldownTimerRef.current);
            cooldownTimerRef.current = null;
        }
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        if (audioSourceRef.current) {
            audioSourceRef.current.stop();
            audioSourceRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            cleanup();
            audioContextRef.current?.close();
        };
    }, [cleanup]);
    
    const playAudio = useCallback(async (base64Audio: string) => {
        if (!audioContextRef.current || !base64Audio) return;

        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }

        if (audioSourceRef.current) {
            audioSourceRef.current.stop();
        }

        try {
            const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                audioContextRef.current,
                24000,
                1
            );
            const source = audioContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.value = speechRate;
            source.connect(audioContextRef.current.destination);
            source.start();
            audioSourceRef.current = source;
            source.onended = () => {
                if (audioSourceRef.current === source) {
                    audioSourceRef.current = null;
                }
            };
        } catch (e) {
            console.error("Error playing audio:", e);
        }
    }, [speechRate]);


    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result.split(',')[1]);
                } else {
                    reject(new Error('Failed to convert blob to base64'));
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    };
    
    const stopStreaming = useCallback(() => {
        cleanup();
        setIsStreaming(false);
        setIsLoading(false);
        setAccidentAlert(null);
        setStatusText('Камера выключена');
        setIsInCooldown(false);
    }, [cleanup]);

    const captureAndDescribe = useCallback((): Promise<void> => {
        return new Promise((resolve) => {
            if (isInCooldown || !videoRef.current || !canvasRef.current || document.hidden) {
                resolve();
                return;
            }
            setIsLoading(true);
            setStatusText('Анализ кадра...');
    
            const video = videoRef.current;
            const canvas = canvasRef.current;

            const MAX_WIDTH = 640;
            const scale = video.videoWidth > MAX_WIDTH ? MAX_WIDTH / video.videoWidth : 1;
            canvas.width = video.videoWidth * scale;
            canvas.height = video.videoHeight * scale;
            
            const context = canvas.getContext('2d');
            if (!context) {
                setIsLoading(false);
                resolve();
                return;
            }
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    setIsLoading(false);
                    setStatusText('Ошибка захвата кадра');
                    resolve();
                    return;
                }
                try {
                    const base64Image = await blobToBase64(blob);
                    const result = await generateDescription(base64Image);
    
                    if (result && videoRef.current?.srcObject) { 
                        if (result.is_accident && result.accident_details) {
                            setAccidentAlert(result.accident_details);
                            setIsInCooldown(true);
                            setStatusText('Обнаружено ДТП! Анализ приостановлен на 30 секунд.');

                            if (isSpeechEnabled) {
                                const audio = await generateSpeech(`Внимание, обнаружено ДТП! ${result.accident_details}`, selectedVoice);
                                if (videoRef.current?.srcObject) {
                                   playAudio(audio);
                                }
                            }
                            
                            cooldownTimerRef.current = window.setTimeout(() => {
                                setAccidentAlert(null);
                                setIsInCooldown(false);
                                setStatusText('Возобновление мониторинга...');
                            }, 30000); 

                        } else {
                            setStatusText('Обстановка спокойная. Мониторинг...');
                        }
                    }
                } catch (err) {
                    setError(err instanceof Error ? err.message : 'An unknown error occurred.');
                    console.error(err);
                    stopStreaming();
                } finally {
                    setIsLoading(false);
                    resolve();
                }
            }, 'image/jpeg', 0.5);
        });
    }, [isSpeechEnabled, playAudio, selectedVoice, stopStreaming, isInCooldown]);
    
    const startStreaming = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    videoRef.current?.play();
                    setIsStreaming(true);
                    setError(null);
                    setAccidentAlert(null);
                    
                    const analysisLoop = async () => {
                        if (!videoRef.current?.srcObject) return;
                        
                        await captureAndDescribe();
                        
                        if (videoRef.current?.srcObject) {
                            analysisTimerRef.current = window.setTimeout(analysisLoop, 500); 
                        }
                    };
                    analysisLoop();
                }
            }
        } catch (err) {
            setError('Could not access camera. Please check permissions.');
            console.error("Error accessing camera:", err);
        }
    };

    const toggleStreaming = () => {
        if (isStreaming) {
            stopStreaming();
        } else {
            startStreaming();
        }
    };

    const handleSpeechToggle = (checked: boolean) => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        setIsSpeechEnabled(checked);
        if (!checked && audioSourceRef.current) {
            audioSourceRef.current.stop();
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4 font-sans">
            <main className="w-full max-w-4xl mx-auto flex flex-col items-center">
                <h1 className="text-4xl md:text-5xl font-bold mb-2 text-center bg-gradient-to-r from-purple-400 to-pink-500 text-transparent bg-clip-text">Дорожный ассистент</h1>
                <p className="text-gray-400 mb-6 text-center">Анализ дорожной ситуации в реальном времени с помощью Gemini.</p>

                <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-gray-700 relative mb-6">
                    <video ref={videoRef} className="w-full h-full object-cover" playsInline autoPlay muted />
                    {!isStreaming && (
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-center p-4">
                            <CameraOff size={64} className="text-gray-500 mb-4" />
                            <h2 className="text-xl font-semibold text-gray-300">Камера выключена</h2>
                            <p className="text-gray-400">Нажмите кнопку ниже, чтобы начать мониторинг ДТП.</p>
                        </div>
                    )}
                    {isLoading && isStreaming && <Spinner />}
                </div>

                 {accidentAlert && (
                    <div className="w-full bg-red-500/90 text-white p-4 rounded-lg mb-6 border border-red-400 flex items-center animate-pulse">
                        <AlertTriangle size={28} className="mr-4 flex-shrink-0" />
                        <div>
                            <strong className="block font-bold text-lg">ВНИМАНИЕ: ОБНАРУЖЕНО ДТП!</strong>
                            <span className="block">{accidentAlert}</span>
                        </div>
                    </div>
                )}

                <div className="w-full bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700 mb-6 flex items-center justify-center text-center">
                    <p className="text-gray-300">
                        {statusText}
                    </p>
                </div>
                
                {error && (
                    <div className="w-full bg-red-900/50 text-red-300 p-4 rounded-lg mb-6 border border-red-700">
                        <strong>Ошибка:</strong> {error}
                    </div>
                )}

                <div className="flex items-center space-x-6">
                    <button
                        onClick={toggleStreaming}
                        className="flex items-center justify-center w-16 h-16 rounded-full bg-purple-600 hover:bg-purple-700 transition-all duration-300 text-white shadow-lg focus:outline-none focus:ring-4 focus:ring-purple-400"
                        aria-label={isStreaming ? "Остановить анализ" : "Начать анализ"}
                    >
                        {isStreaming ? <CameraOff size={32} /> : <Camera size={32} />}
                    </button>
                    
                     <div className="flex items-center space-x-3 bg-gray-800 border border-gray-700 rounded-full p-2">
                        <div className="flex items-center space-x-2 pl-2">
                             {isSpeechEnabled ? <Volume2 size={24} className="text-purple-400"/> : <VolumeX size={24} className="text-gray-500"/>}
                            <ToggleSwitch
                                id="speech-toggle"
                                checked={isSpeechEnabled}
                                onChange={handleSpeechToggle}
                                disabled={!isStreaming}
                                ariaLabel={isSpeechEnabled ? "Отключить озвучивание" : "Включить озвучивание"}
                            />
                        </div>
                        <div className="w-px h-6 bg-gray-600"></div>
                        <button
                            onClick={() => setIsSettingsOpen(true)}
                            className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Настройки озвучивания"
                            disabled={!isStreaming || !isSpeechEnabled}
                        >
                            <Settings size={20} />
                        </button>
                    </div>

                </div>

                <canvas ref={canvasRef} className="hidden"></canvas>
            </main>
            <SettingsModal 
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                voice={selectedVoice}
                onVoiceChange={setSelectedVoice}
                rate={speechRate}
                onRateChange={setSpeechRate}
            />
        </div>
    );
};

export default App;