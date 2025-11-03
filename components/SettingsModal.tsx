import React from 'react';
import { X } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    voice: string;
    onVoiceChange: (voice: string) => void;
    rate: number;
    onRateChange: (rate: number) => void;
}

const voices = [
    { id: 'Kore', name: 'Коре (Женский)' },
    { id: 'Puck', name: 'Пак (Мужской)' },
    { id: 'Charon', name: 'Харон (Мужской)' },
    { id: 'Fenrir', name: 'Фенрир (Мужской)' },
    { id: 'Zephyr', name: 'Зефир (Женский)' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, voice, onVoiceChange, rate, onRateChange }) => {
    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 transition-opacity"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
        >
            <div 
                className="bg-gray-800 rounded-2xl shadow-2xl p-6 border border-gray-700 w-full max-w-md mx-4 transform transition-all"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h2 id="settings-title" className="text-2xl font-bold text-gray-200">Настройки озвучивания</h2>
                    <button 
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                        aria-label="Закрыть настройки"
                    >
                        <X size={24} className="text-gray-400" />
                    </button>
                </div>

                <div className="space-y-6">
                    <div>
                        <label htmlFor="voice-select" className="block text-sm font-medium text-gray-400 mb-2">Голос</label>
                        <select 
                            id="voice-select"
                            value={voice}
                            onChange={(e) => onVoiceChange(e.target.value)}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:ring-purple-500 focus:border-purple-500"
                        >
                            {voices.map((v) => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="rate-slider" className="block text-sm font-medium text-gray-400 mb-2">
                            Скорость речи: <span className="font-bold text-purple-400">{rate.toFixed(1)}x</span>
                        </label>
                        <input
                            id="rate-slider"
                            type="range"
                            min="0.5"
                            max="2"
                            step="0.1"
                            value={rate}
                            onChange={(e) => onRateChange(parseFloat(e.target.value))}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};