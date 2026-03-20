import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeType, themes, ThemeColors } from '../constants/themes';
import { LanguageType, t } from '../constants/translations';

interface AppContextType {
  language: LanguageType;
  theme: ThemeType;
  themeColors: ThemeColors;
  setLanguage: (lang: LanguageType) => Promise<void>;
  setTheme: (theme: ThemeType) => Promise<void>;
  t: (key: string) => string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageType>('en');
  const [theme, setThemeState] = useState<ThemeType>('dark');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const storedLang = await AsyncStorage.getItem('app_language');
        const storedTheme = await AsyncStorage.getItem('app_theme');
        
        if (storedLang === 'en' || storedLang === 'ms') {
          setLanguageState(storedLang as LanguageType);
        }
        if (storedTheme === 'dark' || storedTheme === 'light') {
          setThemeState(storedTheme as ThemeType);
        }
      } catch (error) {
        console.error('Failed to load preferences:', error);
      } finally {
        setIsReady(true);
      }
    };
    
    loadPreferences();
  }, []);

  const setLanguage = async (newLang: LanguageType) => {
    setLanguageState(newLang);
    await AsyncStorage.setItem('app_language', newLang);
  };

  const setTheme = async (newTheme: ThemeType) => {
    setThemeState(newTheme);
    await AsyncStorage.setItem('app_theme', newTheme);
  };

  // Helper bound to the current language
  const translate = (key: any) => {
    return t(key, language);
  };

  if (!isReady) {
    return null; // Or a loading spinner if preferred
  }

  return (
    <AppContext.Provider 
      value={{ 
        language, 
        theme, 
        themeColors: themes[theme],
        setLanguage, 
        setTheme,
        t: translate
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
