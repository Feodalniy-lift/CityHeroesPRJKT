import { GoogleGenAI, Modality, Type } from "@google/genai";

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

interface AccidentReport {
    is_accident: boolean;
    accident_details: string;
}

export async function generateDescription(base64Image: string): Promise<AccidentReport> {
    const model = 'gemini-2.5-flash';
    
    const imagePart = {
        inlineData: {
            mimeType: 'image/jpeg',
            data: base64Image,
        },
    };

    const prompt = `Твоя единственная задача — обнаружить ДТП на изображении. 
- Если ДТП нет, верни is_accident: false.
- Если ДТП есть, верни is_accident: true и кратко опиши его в accident_details.
Ответ должен быть ТОЛЬКО в формате JSON.`;
    
    const textPart = {
        text: prompt,
    };

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
          is_accident: { type: Type.BOOLEAN, description: 'Произошло ли ДТП.' },
          accident_details: { type: Type.STRING, description: 'Описание ДТП, если оно произошло. Пустая строка, если нет.' }
        },
        required: ['is_accident', 'accident_details']
      };

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: { parts: [imagePart, textPart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            }
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as AccidentReport;

    } catch (error) {
        console.error("Error generating content:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
            throw new Error("Превышен лимит запросов. Пожалуйста, подождите минуту и попробуйте снова.");
        }
        if (error instanceof SyntaxError) {
            throw new Error("Не удалось обработать ответ от API. Пожалуйста, попробуйте снова.");
        }
        throw new Error("Не удалось связаться с Gemini API.");
    }
}

export async function generateSpeech(text: string, voiceName: string): Promise<string> {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: `Говори как ассистент водителя: ${text}` }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voiceName },
                    },
                },
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("No audio data received from API.");
        }
        return base64Audio;
    } catch (error) {
        console.error("Error generating speech:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
            throw new Error("Превышен лимит запросов на генерацию речи.");
        }
        throw new Error("Не удалось сгенерировать речь из текста.");
    }
}

// Helper functions for audio decoding
export function decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

export async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
}