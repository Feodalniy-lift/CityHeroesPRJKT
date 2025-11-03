
import React from 'react';

export const Spinner: React.FC = () => {
    return (
        <div className="absolute inset-0 bg-gray-900/30 backdrop-blur-sm flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );
};
